import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@quantia/contracts';
import type { Socket } from 'socket.io';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../common/interfaces/jwt-payload.interface';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WsAuthService {
  private readonly logger = new Logger(WsAuthService.name);
  private readonly usersBySocket = new WeakMap<Socket, AuthenticatedUser>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async authenticateSocket(client: Socket): Promise<AuthenticatedUser> {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('Missing Socket.io auth token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
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

    const authenticated: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((ur): RoleName => ur.role.name),
    };
    this.usersBySocket.set(client, authenticated);
    return authenticated;
  }

  getUser(client: Socket): AuthenticatedUser {
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
