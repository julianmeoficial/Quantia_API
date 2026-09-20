import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { RoleName } from '@quantia/contracts';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/interfaces/jwt-payload.interface';
import { EnvConfig } from '../../config/env.schema';
import { UsersService } from '../../users/users.service';
import { buildAccessVerifyOptions, JWT_ACCESS_ALGORITHM } from '../jwt-options';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<EnvConfig, true>,
    private readonly usersService: UsersService,
  ) {
    const verify = buildAccessVerifyOptions(configService);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: verify.secret as string,
      algorithms: [JWT_ACCESS_ALGORITHM],
      issuer: verify.issuer as string,
      audience: verify.audience as string,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findEntityById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token subject');
    }

    return {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((ur): RoleName => ur.role.name),
    };
  }
}
