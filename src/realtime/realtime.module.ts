import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { EnvConfig } from '../config/env.schema';
import { NotificationsRealtimeGateway } from './notifications-realtime.gateway';
import { ProjectsRealtimeGateway } from './projects-realtime.gateway';
import { RealtimeBridge } from './realtime-bridge.service';
import { RealtimeCoreModule } from './realtime-core.module';
import { WsAuthService } from './ws-auth.service';

@Module({
  imports: [
    RealtimeCoreModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
        },
      }),
    }),
  ],
  providers: [
    WsAuthService,
    ProjectsRealtimeGateway,
    NotificationsRealtimeGateway,
    RealtimeBridge,
  ],
  exports: [RealtimeCoreModule],
})
export class RealtimeModule {}
