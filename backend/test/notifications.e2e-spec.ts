// Plan task 2.10 end to end: Activity list, badge and mark-read; device registration; the push
// processor against a fake Expo Push API (localised text, IDs-only data, no resend, invalid tokens
// deleted from tickets and receipts).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { AppConfig } from '../src/config/app-config.js';
import { NotificationsProcedures } from '../src/infrastructure/db-procedures/notifications.procedures.js';
import { ExpoPushClient, type PushMessage } from '../src/infrastructure/push/expo-push.client.js';
import { PushProcessor } from '../src/workers/notifications/push.processor.js';
import { as, block, createApp, publishPost, registerUser, type TestUser } from './support.js';

/** Fake Expo: tokens containing "gone" are DeviceNotRegistered at send; "late" ones only in the receipt. */
class FakeExpo {
  readonly sent: PushMessage[][] = [];
  private server!: Server;
  private next = 0;
  private readonly lateTickets = new Set<string>();

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = JSON.parse(raw);
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/send') {
          this.sent.push(body);
          const data = (body as PushMessage[]).map((m) => {
            if (m.to.includes('gone')) return { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } };
            const id = `ticket-${++this.next}`;
            if (m.to.includes('late')) this.lateTickets.add(id);
            return { status: 'ok', id };
          });
          res.end(JSON.stringify({ data }));
        } else {
          const data = Object.fromEntries((body.ids as string[]).map((id) => [id, this.lateTickets.has(id)
            ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok' }]));
          res.end(JSON.stringify({ data }));
        }
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.server.close(resolve));
  }
}

const token = (label: string) => `ExponentPushToken[${label}${randomBytes(8).toString('hex')}]`;
const installation = () => `inst-${randomBytes(8).toString('hex')}`;

describe('notifications (e2e)', () => {
  let app: INestApplication<App>;
  let expo: FakeExpo;
  let processor: PushProcessor;

  beforeAll(async () => {
    expo = new FakeExpo();
    process.env.EXPO_PUSH_API_URL = await expo.start();
    app = await createApp();
    processor = new PushProcessor(app.get(NotificationsProcedures), new ExpoPushClient(app.get(AppConfig)));
  });

  afterAll(async () => {
    await app.close();
    await expo.stop();
    delete process.env.EXPO_PUSH_API_URL;
  });

  async function latestNotificationId(user: TestUser): Promise<string> {
    return (await as(app, user).get('/api/v1/notifications?limit=1').expect(200)).body.items[0].id;
  }

  it('lists follow, like and comment activity; counts and marks it read', async () => {
    const [me, amina] = [await registerUser(app), await registerUser(app, 'amina')];
    const postId = await publishPost(app, me);

    await as(app, amina).put(`/api/v1/users/${me.id}/follow`).expect(200);
    await as(app, amina).put(`/api/v1/posts/${postId}/like`).expect(200);
    await as(app, amina).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Nzuri!' }).expect(201);
    await as(app, me).put(`/api/v1/posts/${postId}/like`).expect(200); // own post: no notification

    expect((await as(app, me).get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ count: 3 });
    const list = (await as(app, me).get('/api/v1/notifications').expect(200)).body;
    expect(list.items.map((n: { type: string }) => n.type)).toEqual(['COMMENT', 'LIKE', 'FOLLOW']);
    expect(list.items[0]).toMatchObject({
      actor: { id: amina.id, username: amina.username, isFollowing: false }, postId, commentExcerpt: 'Nzuri!',
      targetAvailable: true, read: false, postThumbUrl: expect.stringMatching(/thumb\.webp$/),
    });
    expect(list.items[2]).toMatchObject({ type: 'FOLLOW', postId: null, postThumbUrl: null });

    expect((await as(app, me).post('/api/v1/notifications/read').send({ ids: [list.items[2].id] }).expect(200)).body).toEqual({ updated: 1 });
    expect((await as(app, me).get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ count: 2 });
    expect((await as(app, me).post('/api/v1/notifications/read').send({ all: true }).expect(200)).body).toEqual({ updated: 2 });
    expect((await as(app, me).get('/api/v1/notifications/unread-count').expect(200)).body).toEqual({ count: 0 });
    // Someone else's ids change nothing.
    expect((await as(app, amina).post('/api/v1/notifications/read').send({ ids: [list.items[0].id] }).expect(200)).body).toEqual({ updated: 0 });

    // A deleted post stays listed but is no longer available.
    await as(app, me).delete(`/api/v1/posts/${postId}`).expect(204);
    const after = (await as(app, me).get('/api/v1/notifications').expect(200)).body;
    expect(after.items[0]).toMatchObject({ type: 'COMMENT', targetAvailable: false, postThumbUrl: null, commentExcerpt: null });
  });

  it('pushes to every device in its language, once, and drops invalid tokens', async () => {
    const [me, neema] = [await registerUser(app), await registerUser(app, 'neema')];
    const [swPhone, enPhone, gonePhone] = [token('sw'), token('en'), token('gone')];
    await as(app, me).put(`/api/v1/me/devices/${installation()}`).send({ token: swPhone, platform: 'ANDROID', locale: 'sw', appVersion: '1.0.0' }).expect(204);
    await as(app, me).put(`/api/v1/me/devices/${installation()}`).send({ token: enPhone, platform: 'IOS', locale: 'en' }).expect(204);
    await as(app, me).put(`/api/v1/me/devices/${installation()}`).send({ token: gonePhone, platform: 'ANDROID' }).expect(204);

    await as(app, neema).put(`/api/v1/users/${me.id}/follow`).expect(200);
    const followId = await latestNotificationId(me);

    const first = await processor.push(followId);
    expect(first.result).toBe('SENT');
    expect(first.tickets).toHaveLength(2);
    const batch = expo.sent.at(-1)!;
    expect(batch).toHaveLength(3); // one request for all devices
    const byToken = Object.fromEntries(batch.map((m) => [m.to, m]));
    expect(byToken[swPhone]).toMatchObject({ title: 'Jamii Air', body: `${neema.username} ameanza kukufuata`, channelId: 'default' });
    expect(byToken[enPhone].body).toBe(`${neema.username} started following you`);
    expect(byToken[enPhone].data).toEqual({ notificationId: followId, type: 'FOLLOW', username: neema.username });

    expect((await processor.push(followId)).result).toBe('SKIPPED'); // a retried job does not resend

    // The DeviceNotRegistered token is gone: the next push reaches only the two good phones.
    const postId = await publishPost(app, me);
    await as(app, neema).put(`/api/v1/posts/${postId}/like`).expect(200);
    const likeId = await latestNotificationId(me);
    await processor.push(likeId);
    expect(expo.sent.at(-1)!.map((m) => m.to).sort()).toEqual([enPhone, swPhone].sort());
    expect(expo.sent.at(-1)![0].data).toMatchObject({ notificationId: likeId, type: 'LIKE', postId });
  });

  it('drops tokens whose receipts say DeviceNotRegistered', async () => {
    const [me, fan] = [await registerUser(app), await registerUser(app)];
    const [late, good] = [token('late'), token('good')];
    await as(app, me).put(`/api/v1/me/devices/${installation()}`).send({ token: late, platform: 'ANDROID' }).expect(204);
    await as(app, me).put(`/api/v1/me/devices/${installation()}`).send({ token: good, platform: 'ANDROID' }).expect(204);

    await as(app, fan).put(`/api/v1/users/${me.id}/follow`).expect(200);
    const { tickets } = await processor.push(await latestNotificationId(me));
    expect(tickets).toHaveLength(2);
    expect(await processor.checkReceipts(tickets)).toBe(1);

    await as(app, fan).delete(`/api/v1/users/${me.id}/follow`).expect(200);
    const postId = await publishPost(app, me);
    await as(app, fan).post(`/api/v1/posts/${postId}/comments`).send({ body: 'Hi' }).expect(201);
    await processor.push(await latestNotificationId(me));
    expect(expo.sent.at(-1)!.map((m) => m.to)).toEqual([good]);
  });

  it('sends nothing once read, after a block, or to a removed device', async () => {
    const [me, fan] = [await registerUser(app), await registerUser(app)];
    const inst = installation();
    await as(app, me).put(`/api/v1/me/devices/${inst}`).send({ token: token('x'), platform: 'ANDROID' }).expect(204);
    const postId = await publishPost(app, me);

    await as(app, fan).put(`/api/v1/posts/${postId}/like`).expect(200);
    const liked = await latestNotificationId(me);
    await as(app, me).post('/api/v1/notifications/read').send({ all: true }).expect(200);
    expect((await processor.push(liked)).result).toBe('SKIPPED');

    await as(app, fan).put(`/api/v1/users/${me.id}/follow`).expect(200);
    const followed = await latestNotificationId(me);
    await block(app, me, fan);
    expect((await processor.push(followed)).result).toBe('SKIPPED');

    await as(app, me).delete(`/api/v1/me/devices/${inst}`).expect(204);
    await as(app, me).delete(`/api/v1/me/devices/${inst}`).expect(204); // idempotent
  });

  it('rejects bad device registrations and mark-read requests', async () => {
    const me = await registerUser(app);
    const inst = installation();
    for (const body of [{}, { token: 'not-a-token', platform: 'ANDROID' }, { token: token('a'), platform: 'WEB' }, { token: token('a'), platform: 'IOS', locale: 'fr' }]) {
      expect((await as(app, me).put(`/api/v1/me/devices/${inst}`).send(body).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await as(app, me).put('/api/v1/me/devices/x').send({ token: token('a'), platform: 'IOS' }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    for (const body of [{}, { ids: [] }, { ids: ['nope'] }, { all: 'yes' }]) {
      expect((await as(app, me).post('/api/v1/notifications/read').send(body).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    }
  });
});
