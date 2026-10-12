import { useSession } from '@/stores/session';
import { fitWithin, uploadImage, waitUntilProcessed } from './upload';

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const intent = (n: number) => ({ mediaId: `m${n}`, uploadUrl: `http://storage.test/put-${n}`, headers: { 'Content-Type': 'image/jpeg' }, expiresAt: '' });

interface Call { url: string; method: string; body?: unknown }
let calls: Call[];
let storage: (url: string) => Response;

beforeEach(() => {
  calls = [];
  let intents = 0;
  useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
    if (url.startsWith('file://')) return new Response(new Uint8Array(1234));
    if (url.endsWith('/media/uploads')) return json(201, intent(++intents));
    return storage(url);
  }) as unknown as typeof fetch;
});

describe('fitWithin (≤ 2048 px long edge, never upscale)', () => {
  it('resizes only the long edge of a large photo', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048 });
    expect(fitWithin(3024, 4032)).toEqual({ height: 2048 });
    expect(fitWithin(1080, 1350)).toBeNull();
  });
});

describe('uploadImage (App Flow §6.1)', () => {
  const image = { uri: 'file:///cache/photo.jpg', width: 1080, height: 1080 };

  it('asks for an intent with the real size, then PUTs the bytes with the signed headers', async () => {
    storage = () => new Response(null, { status: 200 });
    await expect(uploadImage(image, 'AVATAR')).resolves.toBe('m1');
    const ask = calls.find((c) => c.url.endsWith('/media/uploads'))!;
    expect(JSON.parse(ask.body as string)).toEqual({ kind: 'IMAGE', purpose: 'AVATAR', mimeType: 'image/jpeg', byteSize: 1234 });
    const put = calls.find((c) => c.url === 'http://storage.test/put-1')!;
    expect(put.method).toBe('PUT');
  });

  it('retries a network failure with backoff', async () => {
    jest.useFakeTimers();
    let failures = 2;
    storage = () => { if (failures-- > 0) throw new TypeError('Network request failed'); return new Response(null, { status: 200 }); };
    const done = uploadImage(image, 'POST');
    await jest.advanceTimersByTimeAsync(3_000);
    await expect(done).resolves.toBe('m1');
    expect(calls.filter((c) => c.url === 'http://storage.test/put-1')).toHaveLength(3);
    jest.useRealTimers();
  });

  it('gets a fresh intent once when storage refuses an expired URL', async () => {
    storage = (url) => new Response(null, { status: url.endsWith('put-1') ? 403 : 200 });
    await expect(uploadImage(image, 'POST')).resolves.toBe('m2');
  });
});

describe('putWithProgress', () => {
  it('reports progress, lets the platform set Content-Length, and resolves with the status', async () => {
    const sentHeaders: Record<string, string> = {};
    class FakeXhr {
      upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
      onload?: () => void;
      status = 0;
      timeout = 0;
      open() {}
      setRequestHeader(name: string, value: string) { sentHeaders[name] = value; }
      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
        this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
        this.status = 200;
        this.onload?.();
      }
    }
    const original = global.XMLHttpRequest;
    global.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    const seen: number[] = [];
    try {
      const { putWithProgress } = jest.requireActual<typeof import('./upload')>('./upload');
      await expect(putWithProgress('http://storage.test/put', { 'Content-Type': 'image/jpeg', 'Content-Length': '100' }, new Blob(['x']), (p) => seen.push(p)))
        .resolves.toBe(200);
    } finally {
      global.XMLHttpRequest = original;
    }
    expect(seen).toEqual([0.25, 1]);
    expect(sentHeaders).toEqual({ 'Content-Type': 'image/jpeg' });
  });
});

describe('waitUntilProcessed', () => {
  it('polls GET /media/:id until READY', async () => {
    let polls = 0;
    storage = () => json(200, { id: 'm1', status: ++polls < 2 ? 'PROCESSING' : 'READY' });
    await expect(waitUntilProcessed('m1', [0, 0, 0])).resolves.toBe('READY');
    expect(polls).toBe(2);
  });

  it('gives up as PENDING after the last try', async () => {
    storage = () => json(200, { id: 'm1', status: 'PROCESSING' });
    await expect(waitUntilProcessed('m1', [0, 0])).resolves.toBe('PENDING');
  });
});
