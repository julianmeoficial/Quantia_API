import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { realtimeEnvelopeSchema, RealtimeNamespace } from '@quantia/contracts';
import Redis from 'ioredis';
import type { EnvConfig } from '../config/env.schema';
import { REALTIME_REDIS_CHANNEL } from '../queues/realtime.constants';
import { NotificationsRealtimeGateway } from './notifications-realtime.gateway';
import { ProjectsRealtimeGateway } from './projects-realtime.gateway';

@Injectable()
export class RealtimeBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBridge.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly projectsGateway: ProjectsRealtimeGateway,
    private readonly notificationsGateway: NotificationsRealtimeGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get('REDIS_URL', { infer: true });
    this.subscriber = new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.subscriber.on('error', (err) => {
      this.logger.warn(`Realtime subscriber error: ${err.message}`);
    });
    await this.subscriber.connect();
    await this.subscriber.subscribe(REALTIME_REDIS_CHANNEL);
    this.subscriber.on('message', (channel, message) => {
      if (channel !== REALTIME_REDIS_CHANNEL) return;
      this.handleMessage(message);
    });
    this.logger.log(`Subscribed to ${REALTIME_REDIS_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscriber) return;
    try {
      await this.subscriber.unsubscribe(REALTIME_REDIS_CHANNEL);
      this.subscriber.disconnect();
    } catch (error) {
      this.logger.warn(
        `Realtime subscriber shutdown: ${(error as Error).message}`,
      );
    } finally {
      this.subscriber = null;
    }
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = realtimeEnvelopeSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.logger.warn(`Invalid realtime envelope: ${parsed.error.message}`);
        return;
      }
      const { event, namespace, room, payload } = parsed.data;
      if (namespace === RealtimeNamespace.PROJECTS) {
        this.projectsGateway.emitToRoom(room, event, payload);
      } else {
        this.notificationsGateway.emitToRoom(room, event, payload);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fanout realtime message: ${(error as Error).message}`,
      );
    }
  }
}
