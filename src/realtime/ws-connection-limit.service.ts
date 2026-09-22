import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import type { EnvConfig } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';

/**
 * Per-user connection caps and per-socket event rate limits (S5 / ENG-131).
 */
@Injectable()
export class WsConnectionLimitService {
  private readonly logger = new Logger(WsConnectionLimitService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private connKey(userId: string): string {
    return `ws:conn:${userId}`;
  }

  private evtKey(socketId: string): string {
    return `ws:evt:${socketId}`;
  }

  async tryAcquireConnection(
    userId: string,
    socketId: string,
  ): Promise<boolean> {
    const max = this.config.get('WS_MAX_CONNECTIONS_PER_USER', { infer: true });
    const client = this.redis.getClient();
    await this.redis.connect();
    const key = this.connKey(userId);
    const count = await client.scard(key);
    if (count >= max) {
      this.logger.warn(`WS connection limit reached user=${userId} max=${max}`);
      return false;
    }
    await client.sadd(key, socketId);
    await client.expire(key, 86_400);
    return true;
  }

  async releaseConnection(userId: string, socketId: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (client.status === 'end' || client.status === 'close') {
        return;
      }
      await this.redis.connect();
      await client.srem(this.connKey(userId), socketId);
      await client.del(this.evtKey(socketId));
    } catch {
      // App shutdown may close Redis before sockets finish disconnecting.
    }
  }

  async assertEventAllowed(socketId: string): Promise<boolean> {
    const maxPerSec = this.config.get('WS_MAX_EVENTS_PER_SECOND', {
      infer: true,
    });
    const client = this.redis.getClient();
    await this.redis.connect();
    const key = this.evtKey(socketId);
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, 1);
    }
    if (count > maxPerSec) {
      this.logger.warn(`WS event rate exceeded socket=${socketId}`);
      return false;
    }
    return true;
  }

  /** Best-effort: resolve userId stored on the socket data bag. */
  getSocketUserId(client: Socket): string | undefined {
    const data = client.data as { userId?: unknown };
    return typeof data.userId === 'string' ? data.userId : undefined;
  }

  setSocketUserId(client: Socket, userId: string): void {
    (client.data as { userId?: string }).userId = userId;
  }
}
