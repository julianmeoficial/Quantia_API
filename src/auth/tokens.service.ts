import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EnvConfig } from '../config/env.schema';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../database/prisma.service';
import { RoleName } from '@quantia/contracts';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      return 900;
    }
    const value = Number(match[1]);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }

  getAccessExpiresInSeconds(): number {
    return this.parseTtlToSeconds(
      this.configService.get('JWT_ACCESS_TTL', { infer: true }),
    );
  }

  async issueTokens(params: {
    userId: string;
    email: string;
    roles: RoleName[];
    familyId?: string;
  }): Promise<IssuedTokens> {
    const payload: JwtPayload = {
      sub: params.userId,
      email: params.email,
      roles: params.roles,
    };

    const accessTtl = this.configService.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.configService.get('JWT_REFRESH_TTL', {
      infer: true,
    });
    const expiresIn = this.parseTtlToSeconds(accessTtl);

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithm: 'HS256',
      issuer: this.configService.get('JWT_ISSUER', { infer: true }),
      audience: this.configService.get('JWT_AUDIENCE', { infer: true }),
      expiresIn: accessTtl as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(refreshToken);
    const familyId = params.familyId ?? randomUUID();
    const expiresAt = new Date(
      Date.now() + this.parseTtlToSeconds(refreshTtl) * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tokenHash,
        familyId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn };
  }

  async findRefreshByRawToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            userRoles: { include: { role: true } },
          },
        },
      },
    });
  }

  async revokeToken(id: string, replacedById?: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        ...(replacedById ? { replacedById } : {}),
      },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
