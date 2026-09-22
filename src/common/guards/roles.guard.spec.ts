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

  it('allows when no roles are required', async () => {
    getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('allows when user has required role', async () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    await expect(
      guard.canActivate(
        createContext({ user: { roles: [RoleName.ADMINISTRADOR] } }),
      ),
    ).resolves.toBe(true);
  });

  it('denies when user lacks required role', async () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    await expect(
      guard.canActivate(
        createContext({ user: { roles: [RoleName.INVESTIGADOR] } }),
      ),
    ).rejects.toThrow('Insufficient role');
  });

  it('audits DENIED on budget mutation role denial', async () => {
    getAllAndOverride.mockReturnValue([RoleName.COORDINADOR]);
    await expect(
      guard.canActivate(
        createContext({
          user: { id: 'u1', roles: [RoleName.INVESTIGADOR] },
          method: 'POST',
          url: '/api/v1/projects/p1/budget',
          routePath: '/projects/:projectId/budget',
          params: { projectId: 'p1' },
        }),
      ),
    ).rejects.toThrow('Insufficient role');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u1',
        resource: 'budget',
        resourceId: 'p1',
        result: AuditResult.DENIED,
      }),
    );
  });

  it('does not audit role denial on non-mutation GET', async () => {
    getAllAndOverride.mockReturnValue([RoleName.ADMINISTRADOR]);
    await expect(
      guard.canActivate(
        createContext({
          user: { roles: [RoleName.INVESTIGADOR] },
          method: 'GET',
          url: '/api/v1/users',
        }),
      ),
    ).rejects.toThrow('Insufficient role');
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('reads ROLES_KEY metadata key', async () => {
    getAllAndOverride.mockReturnValue([]);
    await guard.canActivate(createContext());
    expect(getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });
});
