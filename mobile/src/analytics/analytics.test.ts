// Task 3.12.b: the KPI events (TRD PA-01). The module reads its key once, at load, so each case
// loads it again with the environment it wants.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@/notifications/installation', () => ({ getInstallationId: () => Promise.resolve('install-1') }));

type Analytics = typeof import('.');

/** Load the module with (or without) a PostHog key, as a build would have it. */
let loaded: Analytics | null = null;

function load(key?: string): Analytics {
  let api!: Analytics;
  jest.isolateModules(() => {
    if (key) process.env.EXPO_PUBLIC_POSTHOG_KEY = key;
    else delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    process.env.EXPO_PUBLIC_POSTHOG_HOST = 'https://ph.test';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the key is read at load
    api = require('.') as Analytics;
  });
  loaded = api;
  return api;
}

const sent = () => (global.fetch as jest.Mock).mock.calls.map(([url, init]: [string, RequestInit]) => ({
  url, body: JSON.parse(init.body as string) as { api_key: string; batch: { event: string; distinct_id: string; properties: object }[] },
}));

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve(new Response('{}', { status: 200 }))) as unknown as typeof fetch;
});

afterEach(() => {
  loaded?.resetAnalytics(); // no queue and no timer left for the next case
  loaded = null;
  delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  delete process.env.EXPO_PUBLIC_POSTHOG_HOST;
});

describe('without a PostHog key (development, and the pilot until the key is set)', () => {
  it('is off: nothing is queued and nothing leaves the phone', async () => {
    const a = load();
    expect(a.analyticsEnabled).toBe(false);
    a.track('app_open');
    a.track('post_created');
    await a.flush();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('with a key', () => {
  it('sends a batch to PostHog, with the api key and one entry per event', async () => {
    const a = load('phc_test');
    a.track('app_open');
    a.track('like');
    await a.flush();

    expect(sent()).toHaveLength(1);
    const { url, body } = sent()[0]!;
    expect(url).toBe('https://ph.test/batch/');
    expect(body.api_key).toBe('phc_test');
    expect(body.batch.map((e) => e.event)).toEqual(['app_open', 'like']);
  });

  it('keys events by the installation until someone signs in, then by the user', async () => {
    const a = load('phc_test');
    a.track('app_open');
    await a.flush();
    expect(sent()[0]!.body.batch[0]!.distinct_id).toBe('install-1');

    a.identify('u1');
    a.track('login');
    await a.flush();
    expect(sent()[1]!.body.batch[0]!.distinct_id).toBe('u1');
  });

  it('carries only counts and codes, never anything about the person', async () => {
    const a = load('phc_test');
    a.identify('u1');
    a.track('upload_failed', { reason: 'MEDIA_TOO_LARGE' });
    a.track('share_tapped', { from: 'post' });
    await a.flush();

    const keys = sent()[0]!.body.batch.flatMap((e) => Object.keys(e.properties));
    expect([...new Set(keys)].sort()).toEqual(['from', 'reason']);
  });

  it('waits for company, so a burst of likes is one request', async () => {
    jest.useFakeTimers();
    try {
      const a = load('phc_test');
      a.track('like');
      a.track('like');
      a.track('like');
      expect(global.fetch).not.toHaveBeenCalled();
      jest.advanceTimersByTime(a.FLUSH_AFTER_MS);
      await Promise.resolve();
      await Promise.resolve();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops what was queued when the session ends, and keeps quiet afterwards', async () => {
    const a = load('phc_test');
    a.identify('u1');
    a.track('like');
    a.identify(null);
    await a.flush();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('swallows a failure: a KPI event is never retried', async () => {
    const a = load('phc_test');
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    a.track('app_open');
    await expect(a.flush()).resolves.toBeUndefined();
  });
});

describe('all ten events of PA-01 are wired somewhere in the app', () => {
  // A missing call site is silent: the event simply never arrives, and the KPI is quietly wrong.
  const PA_01 = ['app_open', 'signup', 'login', 'post_created', 'like',
    'comment', 'follow', 'profile_view', 'share_tapped', 'upload_failed'] as const;

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      const isSource = /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name);
      return isSource ? [readFileSync(path, 'utf8')] : [];
    });
  }

  const code = () => sources(join(__dirname, '..')).join('\n');

  it('each has a track() call', () => {
    const all = code();
    expect(PA_01.filter((event) => !all.includes("track('" + event + "'"))).toEqual([]);
  });

  it('and nothing else is tracked', () => {
    const tracked = [...code().matchAll(/\btrack\('([a-z_]+)'/g)].map((m) => m[1]!);
    expect([...new Set(tracked)].sort()).toEqual([...PA_01].sort());
  });
});
