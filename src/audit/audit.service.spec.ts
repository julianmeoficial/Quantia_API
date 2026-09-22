import { AuditResult } from '@prisma/client';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('inserts an audit log row', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'a1' });
    const prisma = {
      auditLog: { create },
    };
    const service = new AuditService(prisma as never);

    await service.log({
      actorId: 'user-1',
      action: 'POST /budget',
      resource: 'budget',
      resourceId: 'proj-1',
      result: AuditResult.SUCCESS,
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'POST /budget',
        resource: 'budget',
        resourceId: 'proj-1',
        result: AuditResult.SUCCESS,
        ip: '127.0.0.1',
        userAgent: 'jest',
        metadata: undefined,
      },
    });
  });

  it('redacts secrets in metadata', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'a2' });
    const service = new AuditService({
      auditLog: { create },
    } as never);

    await service.log({
      action: 'LOGIN_FAILED',
      resource: 'auth',
      result: AuditResult.DENIED,
      metadata: {
        password: 'secret',
        nested: { refreshToken: 'rt', ok: true },
      },
    });

    const calls = create.mock.calls as Array<
      [{ data: { metadata: Record<string, unknown> } }]
    >;
    expect(calls[0][0].data.metadata).toEqual({
      password: '[Redacted]',
      nested: { refreshToken: '[Redacted]', ok: true },
    });
  });
});
