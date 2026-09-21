import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { RedisModule } from '../redis/redis.module';
import { NotionCoreModule } from './notion-core.module';
import { NotionWebhookController } from './notion-webhook.controller';
import { NotionWebhookReplayService } from './notion-webhook-replay.service';

@Module({
  imports: [
    RedisModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const url = config.get('REDIS_URL', { infer: true });
        return {
          connection: {
            url,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    NotionCoreModule,
  ],
  controllers: [NotionWebhookController],
  providers: [NotionWebhookReplayService],
  exports: [NotionCoreModule],
})
export class NotionModule {}
