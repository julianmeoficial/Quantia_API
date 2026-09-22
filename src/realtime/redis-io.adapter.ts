import { INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, type ServerOptions } from 'socket.io';
import {
  createCorsOriginDelegate,
  parseCorsOrigins,
} from '../common/cors.util';
import type { EnvConfig } from '../config/env.schema';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private corsOrigin:
    | ((
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => void)
    | string[] = [];

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const config = this.app.get(ConfigService<EnvConfig, true>);
    const url = config.get('REDIS_URL', { infer: true });
    const allowlist = parseCorsOrigins(
      config.get('CORS_ORIGINS', { infer: true }),
    );
    const allowVercelPreview = config.get('CORS_VERCEL_PREVIEW', {
      infer: true,
    });
    this.corsOrigin = createCorsOriginDelegate(allowlist, allowVercelPreview);

    this.pubClient = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.subClient = this.pubClient.duplicate();
    this.pubClient.on('error', (err) => {
      this.logger.warn(`Socket.io pub Redis error: ${err.message}`);
    });
    this.subClient.on('error', (err) => {
      this.logger.warn(`Socket.io sub Redis error: ${err.message}`);
    });
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log('Socket.io Redis adapter connected');
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const config = this.app.get(ConfigService<EnvConfig, true>);
    const idleMs = config.get('WS_IDLE_TIMEOUT_MS', { infer: true });
    const server = super.createIOServer(port, {
      ...options,
      pingInterval: Math.min(25_000, Math.floor(idleMs / 2)),
      pingTimeout: idleMs,
      cors: {
        origin: this.corsOrigin,
        credentials: true,
      },
    }) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async close(): Promise<void> {
    try {
      await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
    } catch {
      // Already closed during Nest app teardown.
    }
    this.pubClient = null;
    this.subClient = null;
  }
}
