import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from './logging.module.js';
import { REDACTED, scrub, scrubLogLine } from './scrub.js';

/** A logger configured as LoggingModule configures it, writing lines into an array. */
function logger() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  const log = pino({ redact: { paths: REDACT_PATHS, censor: REDACTED }, formatters: { log: scrubLogLine } }, stream);
  return { log, lines };
}

describe('SE-07 log scrubbing at any depth (Plan 5.4)', () => {
  it('redacts a secret key at the top level, one level down and further down', () => {
    expect(scrubLogLine({ email: 'a@b.co', password: 'p', userId: 'u1' })).toEqual({ email: REDACTED, password: REDACTED, userId: 'u1' });
    expect(scrub({ body: { refreshToken: 'r' }, deep: { a: { b: { accessToken: 't' } } } }))
      .toEqual({ body: { refreshToken: REDACTED }, deep: { a: { b: { accessToken: REDACTED } } } });
  });

  it('finds addresses, push tokens and JWTs inside strings', () => {
    expect(scrub({ detail: 'Key (email)=(amina@example.co.tz) already exists.' }))
      .toEqual({ detail: 'Key (email)=([email]) already exists.' });
    expect(scrub('DeviceNotRegistered: ExponentPushToken[xxxxAAAA] is not registered')).toBe('DeviceNotRegistered: [push-token] is not registered');
    expect(scrub('bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl')).toBe('bearer [jwt]');
  });

  it('scrubs an error: its message, its stack and its cause, keeping the error code', () => {
    const cause = Object.assign(new Error('550 <juma@example.com>: Recipient address rejected'), { code: 'EENVELOPE' });
    const error = Object.assign(new Error('mail to juma@example.com failed', { cause }), { code: 'ESEND' });
    const out = scrub({ err: error }) as { err: { message: string; stack: string; code: string } };
    // pino's default error serializer folds the cause's message and stack into the error's own,
    // which is the shape these logs had before; both addresses are gone from both.
    expect(out.err.message).toBe('mail to [email] failed: 550 <[email]>: Recipient address rejected');
    expect(out.err.stack).toContain('caused by');
    expect(out.err.stack).not.toContain('@example.com');
    expect(out.err.code).toBe('ESEND');
  });

  it('survives cycles and very deep objects', () => {
    const loop: Record<string, unknown> = { name: 'x' };
    loop.self = loop;
    expect(scrub(loop)).toEqual({ name: 'x', self: '[circular]' });
    let deep: Record<string, unknown> = { email: 'a@b.co' };
    for (let i = 0; i < 20; i += 1) deep = { next: deep };
    expect(JSON.stringify(scrub(deep))).not.toContain('a@b.co');
  });

  it('leaves pino-http req and res to their own serializers', () => {
    const req = { method: 'GET' };
    expect(scrubLogLine({ req, res: { statusCode: 200 } }).req).toBe(req);
  });

  it('is what pino actually writes', () => {
    const { log, lines } = logger();
    log.error({ email: 'top@x.co', err: new Error('Key (email)=(leak@x.co) already exists.'), ctx: { a: { token: 't' } } }, 'Unhandled error');
    const line = JSON.stringify(lines[0]);
    expect(line).not.toMatch(/top@x\.co|leak@x\.co|"token":"t"/);
    expect(lines[0]).toMatchObject({ msg: 'Unhandled error', email: REDACTED, err: { message: 'Key (email)=([email]) already exists.' } });
  });
});
