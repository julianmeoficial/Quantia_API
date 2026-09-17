import { Reflector } from '@nestjs/core';
import { RoleName } from '@quantia/contracts';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;

  const guard = new RolesGuard(reflector);

  const createContext = (user?: { roles: RoleName[] }) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as never;

  it('allows when no roles are required', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows when user has required role', () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    expect(
      guard.canActivate(createContext({ roles: [RoleName.ADMINISTRADOR] })),
    ).toBe(true);
  });

  it('denies when user lacks required role', () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    expect(() =>
      guard.canActivate(createContext({ roles: [RoleName.INVESTIGADOR] })),
    ).toThrow('Insufficient role');
  });

  it('reads ROLES_KEY metadata key', () => {
    getAllAndOverride.mockReturnValue([]);
    guard.canActivate(createContext());
    expect(getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });
});
