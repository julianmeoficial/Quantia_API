import { Reflector } from '@nestjs/core';
import { AuditResult } from '@prisma/client';
import { RoleName } from '@quantia/contracts';
import { AuditService } from '../../audit/audit.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;

  const auditLog = jest.fn().mockResolvedValue(undefined);
  const audit = { log: auditLog } as unknown as AuditService;

  const guard = new RolesGuard(reflector, audit);

  const createContext = (opts?: {
    user?: { id?: string; roles: RoleName[] };
    method?: string;
    url?: string;
    routePath?: string;
    params?: Record<string, string>;
  }) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: opts?.user,
          method: opts?.method ?? 'GET',
          url: opts?.url ?? '/api/v1/users',
          path: opts?.url ?? '/api/v1/users',
          route: opts?.routePath ? { path: opts.routePath } : undefined,
          params: opts?.params ?? {},
          ip: '127.0.0.1',
          get: () => 'jest',
        }),
      }),
    }) as never;

  beforeEach(() => {
    auditLog.mockClear();
  });

  it('allows when no roles are required', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows when user has required role', () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    expect(
      guard.canActivate(
        createContext({ user: { roles: [RoleName.ADMINISTRADOR] } }),
      ),
    ).toBe(true);
  });

  it('denies when user lacks required role', () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    expect(() =>
      guard.canActivate(
        createContext({ user: { roles: [RoleName.INVESTIGADOR] } }),
      ),
    ).toThrow('Insufficient role');
  });

  it('audits DENIED on budget mutation role denial', () => {
    getAllAndOverride.mockReturnValue([RoleName.COORDINADOR]);
    expect(() =>
      guard.canActivate(
        createContext({
          user: { id: 'u1', roles: [RoleName.INVESTIGADOR] },
          method: 'POST',
          url: '/api/v1/projects/p1/budget',
          routePath: '/projects/:projectId/budget',
          params: { projectId: 'p1' },
        }),
      ),
    ).toThrow('Insufficient role');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u1',
        resource: 'budget',
        resourceId: 'p1',
        result: AuditResult.DENIED,
      }),
    );
  });

  it('does not audit role denial on non-audited paths', () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    expect(() =>
      guard.canActivate(
        createContext({
          user: { roles: [RoleName.INVESTIGADOR] },
          method: 'GET',
          url: '/api/v1/users',
        }),
      ),
    ).toThrow('Insufficient role');
    expect(auditLog).not.toHaveBeenCalled();
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
