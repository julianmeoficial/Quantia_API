import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { buildAccessSignOptions } from '../auth/jwt-options';
import type { EnvConfig } from '../config/env.schema';
import { NotificationsRealtimeGateway } from './notifications-realtime.gateway';
import { ProjectsRealtimeGateway } from './projects-realtime.gateway';
import { RealtimeBridge } from './realtime-bridge.service';
import { RealtimeCoreModule } from './realtime-core.module';
import { WsAuthService } from './ws-auth.service';
import { WsConnectionLimitService } from './ws-connection-limit.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    RedisModule,
    RealtimeCoreModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const sign = buildAccessSignOptions(config);
        return {
          secret: sign.secret,
          signOptions: {
            algorithm: sign.algorithm,
            issuer: sign.issuer,
            audience: sign.audience,
            expiresIn: sign.expiresIn,
          },
        };
      },
    }),
  ],
  providers: [
    WsAuthService,
    WsConnectionLimitService,
    ProjectsRealtimeGateway,
    NotificationsRealtimeGateway,
    RealtimeBridge,
  ],
  exports: [RealtimeCoreModule],
})
export class RealtimeModule {}
