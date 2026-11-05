import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type AvatarKey, RoleName } from '@quantia/contracts';
import type { Socket } from 'socket.io';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../common/interfaces/jwt-payload.interface';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';

/** Socket principal plus what `/general` needs (display card, token expiry). */
export interface WsAuthenticatedUser extends AuthenticatedUser {
  fullName: string;
  avatar: AvatarKey | null;
  /** JWT `exp` in epoch seconds (undefined if the token had none). */
  tokenExp?: number;
}

@Injectable()
export class WsAuthService {
  private readonly logger = new Logger(WsAuthService.name);
  private readonly usersBySocket = new WeakMap<Socket, WsAuthenticatedUser>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async authenticateSocket(client: Socket): Promise<WsAuthenticatedUser> {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing Socket.io auth token');
    }
    const authenticated = await this.verifyAccessToken(token);
    this.usersBySocket.set(client, authenticated);
    return authenticated;
  }

  /**
   * Validates an access JWT (HS256, iss/aud, exp) and loads the active user.
   * Used on handshake and by `/general` in-band re-authentication.
   */
  async verifyAccessToken(token: string): Promise<WsAuthenticatedUser> {
    let payload: JwtPayload & { exp?: number };
    try {
      payload = await this.jwt.verifyAsync<JwtPayload & { exp?: number }>(
        token,
        {
          secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
          algorithms: ['HS256'],
          issuer: this.config.get('JWT_ISSUER', { infer: true }),
          audience: this.config.get('JWT_AUDIENCE', { infer: true }),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid Socket.io auth token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token subject');
    }

    return {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((ur): RoleName => ur.role.name),
      fullName: user.fullName,
      avatar: user.avatar,
      tokenExp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  }

  /** Replace the cached principal after a successful re-authentication. */
  setUser(client: Socket, user: WsAuthenticatedUser): void {
    this.usersBySocket.set(client, user);
  }

  getUser(client: Socket): WsAuthenticatedUser {
    const user = this.usersBySocket.get(client);
    if (!user) {
      throw new UnauthorizedException('Socket not authenticated');
    }
    return user;
  }

  private extractToken(client: Socket): string | undefined {
    const authRecord = client.handshake.auth;
    if (
      authRecord &&
      typeof authRecord === 'object' &&
      'token' in authRecord &&
      typeof (authRecord as { token: unknown }).token === 'string'
    ) {
      const token = (authRecord as { token: string }).token;
      if (token.length > 0) return token;
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    this.logger.debug(`No auth token on socket ${client.id}`);
    return undefined;
  }
}
