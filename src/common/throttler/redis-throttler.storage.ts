import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../../redis/redis.service';

/**
 * Redis-backed ThrottlerStorage for @nestjs/throttler v6 (S5 / ENG-131).
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redis.getClient();
    await this.redis.connect();

    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));
    const blockSeconds = Math.max(1, Math.ceil(blockDuration / 1000));

    const blockTtl = await client.ttl(blockKey);
    if (blockTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: ttlSeconds,
        isBlocked: true,
        timeToBlockExpire: blockTtl,
      };
    }

    const hits = await client.incr(hitKey);
    if (hits === 1) {
      await client.expire(hitKey, ttlSeconds);
    }

    const timeToExpire = Math.max(0, await client.ttl(hitKey));
    let isBlocked = false;
    let timeToBlockExpire = 0;

    if (hits > limit) {
      isBlocked = true;
      await client.set(blockKey, '1', 'EX', blockSeconds);
      timeToBlockExpire = blockSeconds;
    }

    return {
      totalHits: hits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
