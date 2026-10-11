// Rate-limit counters in Redis (Plan task 2.7) against the local Redis.
import { randomBytes } from 'node:crypto';
import { RedisThrottlerStorage } from '../src/common/rate-limit/redis-throttler.storage.js';
import { createRedis } from '../src/infrastructure/queue/queue.module.js';
import './support.js';

describe('RedisThrottlerStorage', () => {
  const redis = createRedis(process.env.REDIS_URL!);
  const storage = new RedisThrottlerStorage(redis);

  afterAll(async () => {
    await redis.quit();
  });

  it('counts hits in a window and blocks once over the limit', async () => {
    const key = `test-${randomBytes(4).toString('hex')}`;
    const hit = () => storage.increment(key, 60_000, 2, 30_000, 'default');
    expect(await hit()).toMatchObject({ totalHits: 1, isBlocked: false, timeToExpire: 60 });
    expect(await hit()).toMatchObject({ totalHits: 2, isBlocked: false });
    expect(await hit()).toMatchObject({ totalHits: 3, isBlocked: true, timeToBlockExpire: 30 });
    expect(await hit()).toMatchObject({ isBlocked: true });
    expect(await redis.exists(`rl:default:${key}`, `rl:default:${key}:blocked`)).toBe(2);
  });

  it('starts a new window after the TTL', async () => {
    const key = `test-${randomBytes(4).toString('hex')}`;
    await storage.increment(key, 50, 1, 50, 'default');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await storage.increment(key, 50, 1, 50, 'default')).toMatchObject({ totalHits: 1, isBlocked: false });
  });
});

describe('rate limits over HTTP (App Flow §13)', () => {
  it('answers 429 RATE_LIMITED with Retry-After once over a route limit', async () => {
    const { createApp } = await import('./support.js');
    const request = (await import('supertest')).default;
    process.env.NODE_ENV = 'development'; // throttling is off in the test environment
    const app = await createApp();
    const redis = createRedis(process.env.REDIS_URL!);
    try {
      const forgot = () => request(app.getHttpServer()).post('/api/v1/auth/password/forgot').send({ email: `rl_${randomBytes(4).toString('hex')}@example.test` });
      for (let i = 0; i < 3; i++) await forgot().expect(202); // 3 / hour
      const limited = await forgot().expect(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      process.env.NODE_ENV = 'test';
      await app.close();
      // Leave no counters behind for the local dev server (same client IP).
      const keys = await redis.keys('rl:*');
      if (keys.length) await redis.del(...keys);
      await redis.quit();
    }
  }, 30_000); // boots its own app
});
