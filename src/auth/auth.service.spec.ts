import { UnauthorizedException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';

jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
}));

jest.mock('argon2', () => ({
  verify: jest.fn(),
}));

describe('AuthService', () => {
  const findEntityByEmail = jest.fn();
  const issueTokens = jest.fn();
  const findRefreshByRawToken = jest.fn();
  const revokeToken = jest.fn();
  const revokeFamily = jest.fn();

  const usersService = {
    findEntityByEmail,
  } as unknown as UsersService;

  const tokensService = {
    issueTokens,
    findRefreshByRawToken,
    revokeToken,
    revokeFamily,
  } as unknown as TokensService;

  const service = new AuthService(usersService, tokensService);

  const user = {
    id: 'u1',
    email: 'user@quantia.test',
    passwordHash: 'hash',
    isActive: true,
    userRoles: [{ role: { name: RoleName.INVESTIGADOR } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in with valid credentials', async () => {
    findEntityByEmail.mockResolvedValue(user);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    issueTokens.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });

    const result = await service.login({
      email: 'user@quantia.test',
      password: 'password123',
    });

    expect(result.tokenType).toBe('Bearer');
    expect(result.accessToken).toBe('access');
  });

  it('rejects invalid password', async () => {
    findEntityByEmail.mockResolvedValue(user);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'user@quantia.test', password: 'wrongpass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes family when a revoked refresh token is reused', async () => {
    findRefreshByRawToken.mockResolvedValue({
      id: 'rt1',
      familyId: 'fam1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: user,
    });

    await expect(service.refresh('old-refresh')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeFamily).toHaveBeenCalledWith('fam1');
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

    issueTokens.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 900,
    });

    const result = await service.refresh('old-refresh');
    expect(result.refreshToken).toBe('new-refresh');
    expect(revokeToken).toHaveBeenCalledWith('rt1', 'rt2');
  });
});
