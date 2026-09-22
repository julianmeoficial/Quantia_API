import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';

const WINDOW_SECONDS = 60;

/**
 * Tracks 401/403 spikes in Redis and emits structured WARN logs (S5 / ENG-131).
 */
@Injectable()
export class SecurityMetricsService {
  private readonly logger = new Logger(SecurityMetricsService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async recordHttpStatus(status: number): Promise<void> {
    if (status !== 401 && status !== 403) {
      return;
    }
    const threshold = this.config.get('SECURITY_ALERT_401_403_THRESHOLD', {
      infer: true,
    });
    const client = this.redis.getClient();
    await this.redis.connect();
    const key = `security:http:${status}:min`;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, WINDOW_SECONDS);
    }
    if (count === threshold) {
      this.logger.warn(
        `Security alert: ${count} HTTP ${status} responses in ~${WINDOW_SECONDS}s (threshold=${threshold})`,
      );
    }
  }
}
