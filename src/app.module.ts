import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BudgetModule } from './budget/budget.module';
import { ChatGeneralModule } from './chat-general/chat-general.module';
import { CommonModule } from './common/common.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppLoggerModule } from './common/logger/logger.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { AppConfigModule } from './config/config.module';
import type { EnvConfig } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { NotionModule } from './notion/notion.module';
import { ProgressModule } from './progress/progress.module';
import { ProjectsModule } from './projects/projects.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { ReportsModule } from './reports/reports.module';
import { StorageModule } from './storage/storage.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    DatabaseModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (
        config: ConfigService<EnvConfig, true>,
        redis: RedisService,
      ) => ({
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          {
            name: 'default',
            ttl: config.get('THROTTLE_DEFAULT_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_DEFAULT_LIMIT', { infer: true }),
          },
          {
            name: 'auth',
            ttl: config.get('THROTTLE_AUTH_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_AUTH_LIMIT', { infer: true }),
            skipIf: (ctx) => {
              const req = ctx.switchToHttp().getRequest<{ url?: string }>();
              return !String(req.url ?? '').includes('/auth');
            },
          },
          {
            name: 'reports',
            ttl: config.get('THROTTLE_REPORTS_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_REPORTS_LIMIT', { infer: true }),
            skipIf: (ctx) => {
              const req = ctx.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();
              const method = (req.method ?? '').toUpperCase();
              const url = String(req.url ?? '');
              return method !== 'POST' || !url.includes('/reports');
            },
          },
          {
            name: 'chat-general',
            ttl: 60_000,
            limit: config.get('CHAT_GENERAL_RATE_LIMIT', { infer: true }),
            skipIf: (ctx) => {
              const req = ctx.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();
              const method = (req.method ?? '').toUpperCase();
              const url = String(req.url ?? '');
              return (
                method !== 'POST' || !url.includes('/chat/general/messages')
              );
            },
          },
        ],
      }),
    }),
    CommonModule,
    StorageModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    ProgressModule,
    BudgetModule,
    DocumentsModule,
    ReportsModule,
    NotionModule,
    RealtimeModule,
    ChatGeneralModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
