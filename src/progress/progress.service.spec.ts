import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { SyncStatus } from '@prisma/client';
import { ProjectAccessService } from '../common/project-access.service';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProgressRepository } from './progress.repository';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  let service: ProgressService;
  let repository: jest.Mocked<ProgressRepository>;
  let access: jest.Mocked<ProjectAccessService>;

  const user: AuthenticatedUser = {
    id: 'res-id',
    email: 'res@test.com',
    roles: [RoleName.INVESTIGADOR],
  };

  const entry = {
    id: 'prog-1',
    projectId: 'proj-1',
    taskId: 'task-1',
    authorId: 'res-id',
    title: 'Weekly',
    description: 'Done 40%',
    evidenceLinks: ['https://example.com/e1'],
    recordedAt: new Date('2026-01-02T00:00:00.000Z'),
    notionPageId: null,
    lastEditedTime: null,
    syncedAt: null,
    syncStatus: SyncStatus.PENDING,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findTaskInProject: jest.fn(),
    } as unknown as jest.Mocked<ProgressRepository>;

    access = {
      assertCanAccessProject: jest.fn().mockResolvedValue({
        id: 'proj-1',
        coordinatorId: 'coord-id',
      }),
      assertCanMutateOwnedResource: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectAccessService>;

    service = new ProgressService(
      repository,
      access,
      {
        enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        emitAvanceRegistrado: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  });

  it('creates with authorId from JWT', async () => {
    repository.findTaskInProject.mockResolvedValue({ id: 'task-1' });
    repository.create.mockResolvedValue(entry);

    const result = await service.create(user, 'proj-1', {
      title: 'Weekly',
      description: 'Done 40%',
      taskId: 'task-1',
      evidenceLinks: ['https://example.com/e1'],
    });

    expect(repository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ authorId: user.id, projectId: 'proj-1' }),
    );
    expect(result.evidenceLinks).toEqual(['https://example.com/e1']);
  });

  it('rejects task from another project', async () => {
    repository.findTaskInProject.mockResolvedValue(null);

    await expect(
      service.create(user, 'proj-1', {
        title: 'X',
        description: 'Y',
        taskId: 'foreign-task',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies when no project access', async () => {
    access.assertCanAccessProject.mockRejectedValue(
      new ForbiddenException('No access'),
    );

    await expect(
      service.findAll(user, 'proj-b', { page: 1, pageSize: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists and finds one', async () => {
    repository.findMany.mockResolvedValue({ total: 1, entries: [entry] });
    repository.findById.mockResolvedValue(entry);

    const list = await service.findAll(user, 'proj-1', {});
    expect(list.data[0].title).toBe('Weekly');

    const one = await service.findOne(user, 'proj-1', 'prog-1');
    expect(one.id).toBe('prog-1');
  });

  it('updates and removes', async () => {
    repository.findById.mockResolvedValue(entry);
    repository.update.mockResolvedValue({
      ...entry,
      title: 'Updated',
    });
    repository.delete.mockResolvedValue(undefined);

    const updated = await service.update(user, 'proj-1', 'prog-1', {
      title: 'Updated',
    });
    expect(updated.title).toBe('Updated');

    await service.remove(user, 'proj-1', 'prog-1');
    expect(repository.delete.mock.calls).toEqual([['prog-1']]);
  });

  it('404 on cross-project get', async () => {
    repository.findById.mockResolvedValue({
      ...entry,
      projectId: 'other',
    });

    await expect(
      service.findOne(user, 'proj-1', 'prog-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
