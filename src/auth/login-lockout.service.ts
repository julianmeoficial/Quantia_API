import { Injectable } from '@nestjs/common';
import { TooManyRequestsException } from '../common/exceptions/too-many-requests.exception';
import { RedisService } from '../redis/redis.service';

/** Progressive lockout thresholds (failures → lock duration seconds). */
export const LOGIN_LOCKOUT_THRESHOLDS: ReadonlyArray<{
  failures: number;
  lockSeconds: number;
}> = [
  { failures: 5, lockSeconds: 60 },
  { failures: 10, lockSeconds: 300 },
  { failures: 20, lockSeconds: 900 },
];

const FAIL_TTL_SECONDS = 900;
const KEY_PREFIX = 'auth:login';

@Injectable()
export class LoginLockoutService {
  constructor(private readonly redis: RedisService) {}

  private failKey(email: string, ip: string): string {
    return `${KEY_PREFIX}:fail:${email}:${ip}`;
  }

  private lockKey(email: string, ip: string): string {
    return `${KEY_PREFIX}:lock:${email}:${ip}`;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async assertNotLocked(email: string, ip: string): Promise<void> {
    const client = this.redis.getClient();
    await this.redis.connect();
    const remaining = await client.ttl(
      this.lockKey(this.normalizeEmail(email), ip),
    );
    if (remaining > 0) {
      throw new TooManyRequestsException('Too many attempts', remaining);
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const normalized = this.normalizeEmail(email);
    const client = this.redis.getClient();
    await this.redis.connect();

    const fKey = this.failKey(normalized, ip);
    const failures = await client.incr(fKey);
    if (failures === 1) {
      await client.expire(fKey, FAIL_TTL_SECONDS);
    }

    let lockSeconds = 0;
    for (const tier of LOGIN_LOCKOUT_THRESHOLDS) {
      if (failures >= tier.failures) {
        lockSeconds = tier.lockSeconds;
      }
    }

    if (lockSeconds > 0) {
      await client.set(this.lockKey(normalized, ip), '1', 'EX', lockSeconds);
    }
  }

  async clear(email: string, ip: string): Promise<void> {
    const normalized = this.normalizeEmail(email);
    const client = this.redis.getClient();
    await this.redis.connect();
    await client.del(
      this.failKey(normalized, ip),
      this.lockKey(normalized, ip),
    );
  }
}
