import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Socket } from 'socket.io';
import type { EnvConfig } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';

/** Each replica refreshes its sockets this often. */
export const WS_CONN_HEARTBEAT_MS = 30_000;
/** A socket entry not refreshed for this long belongs to a dead replica. */
export const WS_CONN_STALE_MS = WS_CONN_HEARTBEAT_MS * 3;

/**
 * Atomic acquire: prune stale sockets, check the cap, register.
 * KEYS[1]=zset  ARGV: socketId, nowMs, staleMs, max
 */
const ACQUIRE_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[2])
local stale = tonumber(ARGV[3])
local max = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - stale)
if redis.call('ZSCORE', key, ARGV[1]) then
  redis.call('ZADD', key, now, ARGV[1])
  return 1
end
if redis.call('ZCARD', key) >= max then
  return 0
end
redis.call('ZADD', key, now, ARGV[1])
redis.call('PEXPIRE', key, stale * 2)
return 1
`;

type RedisWithAcquire = {
  wsConnAcquire: (
    key: string,
    socketId: string,
    now: number,
    staleMs: number,
    max: number,
  ) => Promise<number>;
};

/**
 * Per-user connection caps and per-socket event rate limits (S5 / ENG-131).
 *
 * v2: entries live in a ZSET scored by last heartbeat (`ws:conn:v2:<userId>`),
 * so sockets of a crashed/redeployed replica expire after WS_CONN_STALE_MS
 * instead of locking the user out ("Too many connections") for up to 24 h.
 */
@Injectable()
export class WsConnectionLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WsConnectionLimitService.name);
  /** socketId → userId for sockets owned by this process. */
  private readonly localSockets = new Map<string, string>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private luaReady = false;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  onModuleInit(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat();
    }, WS_CONN_HEARTBEAT_MS);
    this.heartbeatTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const [socketId, userId] of [...this.localSockets.entries()]) {
      await this.releaseConnection(userId, socketId);
    }
  }

  private connKey(userId: string): string {
    return `ws:conn:v2:${userId}`;
  }

  private evtKey(socketId: string): string {
    return `ws:evt:${socketId}`;
  }

  private async ensureLua(): Promise<void> {
    if (this.luaReady) return;
    await this.redis.connect();
    this.redis.getClient().defineCommand('wsConnAcquire', {
      numberOfKeys: 1,
      lua: ACQUIRE_LUA,
    });
    this.luaReady = true;
  }

  async tryAcquireConnection(
    userId: string,
    socketId: string,
  ): Promise<boolean> {
    const max = this.config.get('WS_MAX_CONNECTIONS_PER_USER', { infer: true });
    await this.ensureLua();
    const client = this.redis.getClient() as unknown as RedisWithAcquire;
    const ok = Number(
      await client.wsConnAcquire(
        this.connKey(userId),
        socketId,
        Date.now(),
        WS_CONN_STALE_MS,
        max,
      ),
    );
    if (ok !== 1) {
      this.logger.warn(`WS connection limit reached user=${userId} max=${max}`);
      return false;
    }
    this.localSockets.set(socketId, userId);
    return true;
  }

  async releaseConnection(userId: string, socketId: string): Promise<void> {
    this.localSockets.delete(socketId);
    try {
      const client = this.redis.getClient();
      if (client.status === 'end' || client.status === 'close') {
        return;
      }
      await this.redis.connect();
      await client.zrem(this.connKey(userId), socketId);
      await client.del(this.evtKey(socketId));
    } catch {
      // App shutdown may close Redis before sockets finish disconnecting.
    }
  }

  /** Refresh scores of live local sockets (exported for tests). */
  async heartbeat(): Promise<void> {
    if (this.localSockets.size === 0) return;
    try {
      await this.redis.connect();
      const client = this.redis.getClient();
      const now = Date.now();
      const pipeline = client.pipeline();
      for (const [socketId, userId] of this.localSockets) {
        pipeline.zadd(this.connKey(userId), 'XX', now, socketId);
        pipeline.pexpire(this.connKey(userId), WS_CONN_STALE_MS * 2);
      }
      await pipeline.exec();
    } catch (error) {
      this.logger.warn(`WS conn heartbeat failed: ${(error as Error).message}`);
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
