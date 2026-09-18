import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { EnvConfig } from './config/env.schema';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { NotionCoreModule } from './notion/notion-core.module';
import { NotionSyncProcessor } from './notion/notion-sync.processor';
import { RealtimeCoreModule } from './realtime/realtime-core.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    RealtimeCoreModule,
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
  providers: [NotionSyncProcessor],
})
export class WorkerModule {}
