import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PresenceUser } from '@quantia/contracts';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeEmitter } from './realtime-emitter.service';

const PREFIX = 'quantia:chat:general:presence';

const JOIN_LUA = `
local socketKey = KEYS[1]
local socketsKey = KEYS[2]
local usersKey = KEYS[3]
local userId = ARGV[1]
local socketId = ARGV[2]
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
redis.call('SET', socketKey, userId, 'EX', ttl)
redis.call('SADD', socketsKey, socketId)
redis.call('ZADD', usersKey, now, userId)
return redis.call('SCARD', socketsKey)
`;

const LEAVE_LUA = `
local socketKey = KEYS[1]
local socketsKey = KEYS[2]
local usersKey = KEYS[3]
local userId = ARGV[1]
local socketId = ARGV[2]
redis.call('DEL', socketKey)
redis.call('SREM', socketsKey, socketId)
local remaining = redis.call('SCARD', socketsKey)
if remaining == 0 then
  redis.call('DEL', socketsKey)
  redis.call('ZREM', usersKey, userId)
  return 1
end
return 0
`;

@Injectable()
export class ChatGeneralPresenceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChatGeneralPresenceService.name);
  private heartbeatTimer: NodeJS.Timeout | null = null;
  /** Sockets owned by this API process: socketId → userId */
  private readonly localSockets = new Map<string, string>();
  private luaReady = false;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get('CHAT_GENERAL_ENABLED', { infer: true })) {
      return;
    }
    await this.ensureLua();
    const seconds = this.config.get('CHAT_GENERAL_HEARTBEAT_SECONDS', {
      infer: true,
    });
    this.heartbeatTimer = setInterval(() => {
      void this.runMaintenanceTick();
    }, seconds * 1000);
    this.heartbeatTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const entries = [...this.localSockets.entries()];
    for (const [socketId, userId] of entries) {
      try {
        await this.leave(userId, socketId);
      } catch {
        // best-effort on shutdown
      }
    }
  }

  private usersKey(): string {
    return `${PREFIX}:users`;
  }

  private socketsKey(userId: string): string {
    return `${PREFIX}:user:${userId}:sockets`;
  }

  private socketKey(socketId: string): string {
    return `${PREFIX}:socket:${socketId}`;
  }

  private lockKey(): string {
    return `${PREFIX}:reconcile:lock`;
  }

  private async ensureLua(): Promise<void> {
    if (this.luaReady) return;
    await this.redis.connect();
    const client = this.redis.getClient();
    client.defineCommand('chatGeneralJoin', {
      numberOfKeys: 3,
      lua: JOIN_LUA,
    });
    client.defineCommand('chatGeneralLeave', {
      numberOfKeys: 3,
      lua: LEAVE_LUA,
    });
    this.luaReady = true;
  }

  /**
   * Registers a socket. Emits `usuario-conectado` only on 0→1 transition.
   */
  async join(userId: string, socketId: string): Promise<void> {
    await this.ensureLua();
    const ttl = this.config.get('CHAT_GENERAL_PRESENCE_TTL_SECONDS', {
      infer: true,
    });
    const client = this.redis.getClient() as unknown as RedisWithChatCommands;
    const count = Number(
      await client.chatGeneralJoin(
        this.socketKey(socketId),
        this.socketsKey(userId),
        this.usersKey(),
        userId,
        socketId,
        Date.now(),
        ttl,
      ),
    );
    this.localSockets.set(socketId, userId);
    if (count === 1) {
      const user = await this.loadPresenceUser(userId);
      if (user) {
        await this.realtime.emitChatGeneralUsuarioConectado({
          user,
          occurredAt: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Unregisters a socket. Emits `usuario-desconectado` only when last socket closes.
   */
  async leave(userId: string, socketId: string): Promise<void> {
    await this.ensureLua();
    const client = this.redis.getClient() as unknown as RedisWithChatCommands;
    const becameOffline = Number(
      await client.chatGeneralLeave(
        this.socketKey(socketId),
        this.socketsKey(userId),
        this.usersKey(),
        userId,
        socketId,
      ),
    );
    this.localSockets.delete(socketId);
    if (becameOffline === 1) {
      await this.realtime.emitChatGeneralUsuarioDesconectado({
        userId,
        occurredAt: new Date().toISOString(),
      });
    }
  }

  async listOnlineUserIds(): Promise<string[]> {
    await this.redis.connect();
    return this.redis.getClient().zrange(this.usersKey(), 0, -1);
  }

  async buildPresenceSnapshot(): Promise<{
    users: PresenceUser[];
    generatedAt: string;
  }> {
    const ids = await this.listOnlineUserIds();
    const users = await this.resolvePresenceUsers(ids);
    return { users, generatedAt: new Date().toISOString() };
  }

  private async loadPresenceUser(userId: string): Promise<PresenceUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!user) return null;
    return { id: user.id, name: user.fullName, avatarUrl: null };
  }

  private async resolvePresenceUsers(
    userIds: string[],
  ): Promise<PresenceUser[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, fullName: true },
    });
    const byId = new Map(rows.map((u) => [u.id, u]));
    return userIds
      .map((id) => byId.get(id))
      .filter((u): u is { id: string; fullName: string } => u != null)
      .map((u) => ({ id: u.id, name: u.fullName, avatarUrl: null }));
  }

  /**
   * Heartbeat + orphan reconciliation. Invoked by the interval and by unit tests.
   */
  async runMaintenanceTick(): Promise<void> {
    try {
      await this.heartbeatLocal();
      await this.reconcile();
    } catch (error) {
      this.logger.warn(`Presence tick failed: ${(error as Error).message}`);
    }
  }

  private async heartbeatLocal(): Promise<void> {
    if (this.localSockets.size === 0) return;
    await this.redis.connect();
    const client = this.redis.getClient();
    const ttl = this.config.get('CHAT_GENERAL_PRESENCE_TTL_SECONDS', {
      infer: true,
    });
    const now = Date.now();
    const pipeline = client.pipeline();
    for (const [socketId, userId] of this.localSockets) {
      pipeline.expire(this.socketKey(socketId), ttl);
      pipeline.zadd(this.usersKey(), now, userId);
    }
    await pipeline.exec();
  }

  private async reconcile(): Promise<void> {
    await this.redis.connect();
    const client = this.redis.getClient();
    const ttlMs =
      this.config.get('CHAT_GENERAL_PRESENCE_TTL_SECONDS', { infer: true }) *
      1000;
    const locked = await client.set(
      this.lockKey(),
      '1',
      'PX',
      Math.min(ttlMs, 15_000),
      'NX',
    );
    if (locked !== 'OK') return;

    try {
      const staleBefore = Date.now() - ttlMs;
      const staleUserIds = await client.zrangebyscore(
        this.usersKey(),
        '-inf',
        staleBefore,
      );
      for (const userId of staleUserIds) {
        const socketIds = await client.smembers(this.socketsKey(userId));
        if (socketIds.length === 0) {
          await client.zrem(this.usersKey(), userId);
          continue;
        }
        for (const socketId of socketIds) {
          const exists = await client.exists(this.socketKey(socketId));
          if (exists === 0) {
            await this.leave(userId, socketId);
          }
        }
      }
    } finally {
      await client.del(this.lockKey());
    }
  }
}

type RedisWithChatCommands = {
  chatGeneralJoin: (
    socketKey: string,
    socketsKey: string,
    usersKey: string,
    userId: string,
    socketId: string,
    now: number,
    ttl: number,
  ) => Promise<number>;
  chatGeneralLeave: (
    socketKey: string,
    socketsKey: string,
    usersKey: string,
    userId: string,
    socketId: string,
  ) => Promise<number>;
};
