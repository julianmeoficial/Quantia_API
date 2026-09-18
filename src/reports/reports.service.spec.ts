import { ReportKind, ReportStatus } from '@prisma/client';
import { RoleName } from '@quantia/contracts';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let repository: jest.Mocked<ReportsRepository>;
  let access: jest.Mocked<ProjectAccessService>;
  let queueAdd: jest.Mock;

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'u@test.com',
    roles: [RoleName.COORDINADOR],
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<ReportsRepository>;

    access = {
      assertCanAccessProject: jest.fn().mockResolvedValue({
        id: 'proj-1',
        coordinatorId: 'user-1',
      }),
    } as unknown as jest.Mocked<ProjectAccessService>;

    queueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });

    service = new ReportsService(
      repository,
      access,
      {
        createSignedUrl: jest.fn(),
      } as never,
      {
        get: jest.fn().mockReturnValue(300),
      } as never,
      { add: queueAdd } as never,
    );
  });

  it('creates queued report and enqueues job', async () => {
    repository.create.mockResolvedValue({
      id: 'report-1',
      projectId: 'proj-1',
      requestedById: 'user-1',
      kind: ReportKind.BUDGET_PDF,
      status: ReportStatus.QUEUED,
      jobId: null,
      storageBucket: null,
      storageKey: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repository.update.mockResolvedValue({} as never);

    const result = await service.create(user, 'proj-1', {
      kind: ReportKind.BUDGET_PDF,
    });

    expect(result).toEqual({
      reportId: 'report-1',
      status: ReportStatus.QUEUED,
    });
    expect(queueAdd).toHaveBeenCalledWith(
      'report:generate',
      { reportId: 'report-1' },
      expect.objectContaining({ jobId: 'report-1' }),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock
    expect(repository.update).toHaveBeenCalledWith('report-1', {
      jobId: 'job-1',
    });
  });
});
