import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
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
  ) {
    this.dummyHashPromise = hashPassword('quantia-dummy-password-not-used');
  }

  async login(
    dto: LoginDto,
    clientIp: string,
  ): Promise<IssuedTokens & { tokenType: 'Bearer' }> {
    const ip = clientIp.trim() || 'unknown';
    await this.loginLockout.assertNotLocked(dto.email, ip);

    const user = await this.usersService.findEntityByEmail(dto.email);
    if (!user || !user.isActive) {
      await verifyPassword(await this.dummyHashPromise, dto.password);
      await this.loginLockout.recordFailure(dto.email, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await verifyPassword(user.passwordHash, dto.password);
    if (!valid) {
      await this.loginLockout.recordFailure(dto.email, ip);
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
      await this.tokensService.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      await this.tokensService.revokeToken(stored.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!stored.user.isActive) {
      await this.tokensService.revokeFamily(stored.familyId);
      throw new UnauthorizedException('User inactive');
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
    await this.tokensService.revokeToken(stored.id, newStored?.id);

    return { ...tokens, tokenType: 'Bearer' };
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.tokensService.findRefreshByRawToken(refreshToken);
    if (!stored || stored.revokedAt) {
      return;
    }
    await this.tokensService.revokeToken(stored.id);
  }
}
