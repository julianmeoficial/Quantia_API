import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { NotionCoreModule } from './notion-core.module';
import { NotionWebhookController } from './notion-webhook.controller';

@Module({
  imports: [
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
  exports: [NotionCoreModule],
})
export class NotionModule {}
