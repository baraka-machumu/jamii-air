// Rate-limit counters in Redis (Plan task 2.7, Schema §12 `rl:{route}:{subject}`), so limits hold
// across restarts and several API containers. Fixed window per key; once over the limit the key is
// blocked for blockDuration (default: the window).
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

interface StorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

// KEYS[1] counter, KEYS[2] block flag; ARGV ttl ms, limit, block ms.
const SCRIPT = `
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or ARGV[2]) + 1, redis.call('PTTL', KEYS[1]), 1, blocked }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<StorageRecord> {
    const base = `rl:${throttlerName}:${key}`;
    const [hits, ttlMs, blocked, blockMs] = (await this.redis.eval(
      SCRIPT, 2, base, `${base}:blocked`, ttl, limit, blockDuration > 0 ? blockDuration : ttl,
    )) as [number, number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
      isBlocked: blocked === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
    };
  }
}
