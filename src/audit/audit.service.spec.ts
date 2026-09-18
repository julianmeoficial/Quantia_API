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
});
