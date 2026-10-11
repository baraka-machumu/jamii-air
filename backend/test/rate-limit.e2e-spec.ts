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
