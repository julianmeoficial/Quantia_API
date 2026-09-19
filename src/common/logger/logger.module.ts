import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { EnvConfig } from '../../config/env.schema';
import { buildPinoParams } from './logger.config';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        buildPinoParams(config.get('NODE_ENV', { infer: true })),
    }),
  ],
})
export class AppLoggerModule {}
