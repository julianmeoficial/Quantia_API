import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const KEY_PREFIX = 'notion:webhook:replay';

/**
 * Deduplicates Notion webhook deliveries within the skew window (S4 / ENG-130).
 * Keyed by SHA-256 of the signature header so replays of the same signed event fail.
 */
@Injectable()
export class NotionWebhookReplayService {
  constructor(private readonly redis: RedisService) {}

  private key(signature: string): string {
    const digest = createHash('sha256').update(signature).digest('hex');
    return `${KEY_PREFIX}:${digest}`;
  }

  /**
   * @returns true if this is the first time we see the signature (accepted).
   *          false if Redis already holds the key (replay).
   */
  async claim(signature: string, ttlSeconds: number): Promise<boolean> {
    const client = this.redis.getClient();
    await this.redis.connect();
    const result = await client.set(
      this.key(signature),
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }
}
