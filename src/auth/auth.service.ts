import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { RoleName } from '@quantia/contracts';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/auth.dto';
import { LoginLockoutService } from './login-lockout.service';
import { hashPassword, verifyPassword } from './password.util';
import { IssuedTokens, TokensService } from './tokens.service';

@Injectable()
export class AuthService {
  /** Precomputed dummy hash so missing-user paths take similar time to verify. */
  private readonly dummyHashPromise: Promise<string>;

  constructor(
    private readonly usersService: UsersService,
    private readonly tokensService: TokensService,
    private readonly loginLockout: LoginLockoutService,
    private readonly audit: AuditService,
  ) {
    this.dummyHashPromise = hashPassword('quantia-dummy-password-not-used');
  }

  async login(
    dto: LoginDto,
    clientIp: string,
  ): Promise<IssuedTokens & { tokenType: 'Bearer' }> {
    const ip = clientIp.trim() || 'unknown';
    try {
      await this.loginLockout.assertNotLocked(dto.email, ip);
    } catch (error) {
      await this.audit.log({
        actorId: null,
        action: 'LOGIN_LOCKOUT',
        resource: 'auth',
        result: AuditResult.DENIED,
        ip,
        metadata: { reason: 'account_locked' },
      });
      throw error;
    }

    const user = await this.usersService.findEntityByEmail(dto.email);
    if (!user || !user.isActive) {
      await verifyPassword(await this.dummyHashPromise, dto.password);
      await this.loginLockout.recordFailure(dto.email, ip);
      await this.audit.log({
        actorId: null,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        result: AuditResult.DENIED,
        ip,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await verifyPassword(user.passwordHash, dto.password);
    if (!valid) {
      await this.loginLockout.recordFailure(dto.email, ip);
      await this.audit.log({
        actorId: user.id,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        result: AuditResult.DENIED,
        ip,
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.loginLockout.clear(dto.email, ip);

    const roles: RoleName[] = user.userRoles.map((ur) => ur.role.name);
    const tokens = await this.tokensService.issueTokens({
      userId: user.id,
      email: user.email,
      roles,
    });

    return { ...tokens, tokenType: 'Bearer' };
  }

  async refresh(
    refreshToken: string,
  ): Promise<IssuedTokens & { tokenType: 'Bearer' }> {
    const stored = await this.tokensService.findRefreshByRawToken(refreshToken);
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Classic theft: old token reused after a completed rotation.
      if (stored.replacedById) {
        await this.rejectRefreshReuse(stored.userId, stored.familyId);
      }
      // Consumed mid-flight (peer won tryConsume) or logout — reject without
      // killing the winner's newly issued refresh.
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      await this.tokensService.revokeToken(stored.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!stored.user.isActive) {
      await this.tokensService.revokeFamily(stored.familyId);
      throw new UnauthorizedException('User inactive');
    }

    // Consume atomically before issuing a replacement (closes QX-P5-001 race).
    const consumed = await this.tokensService.tryConsumeRefresh(stored.id);
    if (!consumed) {
      // Another concurrent refresh won the consume; do not revoke the family
      // (that would kill the winner's new token). Classic reuse is handled above
      // when revokedAt was already set on read.
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const roles: RoleName[] = stored.user.userRoles.map((ur) => ur.role.name);

    const tokens = await this.tokensService.issueTokens({
      userId: stored.userId,
      email: stored.user.email,
      roles,
      familyId: stored.familyId,
    });

    const newStored = await this.tokensService.findRefreshByRawToken(
      tokens.refreshToken,
    );
    if (newStored?.id) {
      await this.tokensService.linkReplacedBy(stored.id, newStored.id);
    }

    return { ...tokens, tokenType: 'Bearer' };
  }

  private async rejectRefreshReuse(
    userId: string,
    familyId: string,
  ): Promise<never> {
    await this.tokensService.revokeFamily(familyId);
    await this.audit.log({
      actorId: userId,
      action: 'REFRESH_REUSE',
      resource: 'auth',
      resourceId: familyId,
      result: AuditResult.DENIED,
      metadata: { reason: 'refresh_token_reuse' },
    });
    throw new UnauthorizedException('Refresh token reuse detected');
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.tokensService.findRefreshByRawToken(refreshToken);
    if (!stored || stored.revokedAt) {
      return;
    }
    await this.tokensService.revokeToken(stored.id);
  }
}
