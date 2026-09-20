import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EnvConfig } from '../config/env.schema';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { buildAccessSignOptions } from './jwt-options';
import { LoginLockoutService } from './login-lockout.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    UsersModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
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
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy, LoginLockoutService],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
