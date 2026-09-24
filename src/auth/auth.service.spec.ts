import { UnauthorizedException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginLockoutService } from './login-lockout.service';
import * as passwordUtil from './password.util';
import { TokensService } from './tokens.service';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

jest.mock('./password.util', () => ({
  hashPassword: jest.fn().mockResolvedValue('dummy-hash'),
  verifyPassword: jest.fn(),
}));

describe('AuthService', () => {
  const findEntityByEmail = jest.fn();
  const issueTokens = jest.fn();
  const findRefreshByRawToken = jest.fn();
  const revokeToken = jest.fn();
  const revokeFamily = jest.fn();
  const tryConsumeRefresh = jest.fn();
  const linkReplacedBy = jest.fn();
  const assertNotLocked = jest.fn().mockResolvedValue(undefined);
  const recordFailure = jest.fn().mockResolvedValue(undefined);
  const clear = jest.fn().mockResolvedValue(undefined);
  const auditLog = jest.fn().mockResolvedValue(undefined);

  const usersService = {
    findEntityByEmail,
  } as unknown as UsersService;

  const tokensService = {
    issueTokens,
    findRefreshByRawToken,
    revokeToken,
    revokeFamily,
    tryConsumeRefresh,
    linkReplacedBy,
  } as unknown as TokensService;

  const loginLockout = {
    assertNotLocked,
    recordFailure,
    clear,
  } as unknown as LoginLockoutService;

  const audit = { log: auditLog } as unknown as AuditService;

  const service = new AuthService(
    usersService,
    tokensService,
    loginLockout,
    audit,
  );

  const user = {
    id: 'u1',
    email: 'user@quantia.test',
    passwordHash: 'hash',
    isActive: true,
    userRoles: [{ role: { name: RoleName.INVESTIGADOR } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    assertNotLocked.mockResolvedValue(undefined);
  });

  it('logs in with valid credentials', async () => {
    findEntityByEmail.mockResolvedValue(user);
    (passwordUtil.verifyPassword as jest.Mock).mockResolvedValue(true);
    issueTokens.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const result = await service.login(
      {
        email: 'user@quantia.test',
        password: 'password123',
      },
      '127.0.0.1',
    );

    expect(result.tokenType).toBe('Bearer');
    expect(result.accessToken).toBe('access');
    expect(clear).toHaveBeenCalledWith('user@quantia.test', '127.0.0.1');
  });

  it('rejects invalid password and records failure', async () => {
    findEntityByEmail.mockResolvedValue(user);
    (passwordUtil.verifyPassword as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login(
        { email: 'user@quantia.test', password: 'wrongpass' },
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(recordFailure).toHaveBeenCalled();
  });

  it('runs dummy verify when user is missing', async () => {
    findEntityByEmail.mockResolvedValue(null);
    (passwordUtil.verifyPassword as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login(
        { email: 'ghost@quantia.test', password: 'whatever' },
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwordUtil.verifyPassword).toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalled();
  });

  it('revokes family when a revoked refresh token is reused', async () => {
    findRefreshByRawToken.mockResolvedValue({
      id: 'rt1',
      familyId: 'fam1',
      userId: 'u1',
      revokedAt: new Date(),
      replacedById: 'rt2',
      expiresAt: new Date(Date.now() + 60_000),
      user: user,
    });

    await expect(service.refresh('old-refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeFamily).toHaveBeenCalledWith('fam1');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFRESH_REUSE' }),
    );
  });

  it('rejects mid-flight consumed refresh without killing the family', async () => {
    findRefreshByRawToken.mockResolvedValue({
      id: 'rt1',
      familyId: 'fam1',
      userId: 'u1',
      revokedAt: new Date(),
      replacedById: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });

    await expect(service.refresh('in-flight')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeFamily).not.toHaveBeenCalled();
  });

  it('rotates refresh tokens on success', async () => {
    findRefreshByRawToken
      .mockResolvedValueOnce({
        id: 'rt1',
        familyId: 'fam1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        userId: 'u1',
        user,
      })
      .mockResolvedValueOnce({ id: 'rt2' });

    tryConsumeRefresh.mockResolvedValue(true);
    issueTokens.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    const result = await service.refresh('old-refresh');
    expect(result.refreshToken).toBe('new-refresh');
    expect(tryConsumeRefresh).toHaveBeenCalledWith('rt1');
    expect(linkReplacedBy).toHaveBeenCalledWith('rt1', 'rt2');
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it('treats failed atomic consume as refresh reuse', async () => {
    findRefreshByRawToken.mockResolvedValue({
      id: 'rt1',
      familyId: 'fam1',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });
    tryConsumeRefresh.mockResolvedValue(false);

    await expect(service.refresh('raced-refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Race loser must not kill the winner's family.
    expect(revokeFamily).not.toHaveBeenCalled();
    expect(issueTokens).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});
