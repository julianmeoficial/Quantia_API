import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { SyncStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { ProjectAccessService } from '../common/project-access.service';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  let service: TasksService;
  let repository: jest.Mocked<TasksRepository>;
  let access: jest.Mocked<ProjectAccessService>;

  const user: AuthenticatedUser = {
    id: 'res-id',
    email: 'res@test.com',
    roles: [RoleName.INVESTIGADOR],
  };

  const task = {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Lit review',
    description: null,
    assigneeId: 'res-id',
    status: TaskStatus.TODO,
    priority: TaskPriority.HIGH,
    dueDate: null,
    notionPageId: null,
    lastEditedTime: null,
    syncedAt: null,
    syncStatus: SyncStatus.PENDING,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TasksRepository>;

    access = {
      assertCanAccessProject: jest.fn().mockResolvedValue({
        id: 'proj-1',
        coordinatorId: 'coord-id',
      }),
      assertUserIsProjectMember: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectAccessService>;

    service = new TasksService(
      repository,
      access,
      {
        enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        emitTareaActualizada: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  });

  it('creates task after access check', async () => {
    repository.create.mockResolvedValue(task);

    const result = await service.create(user, 'proj-1', {
      title: 'Lit review',
      assigneeId: 'res-id',
      priority: TaskPriority.HIGH,
    });

    expect(access.assertCanAccessProject.mock.calls).toEqual([
      [user, 'proj-1'],
    ]);
    expect(access.assertUserIsProjectMember.mock.calls).toEqual([
      ['proj-1', 'res-id'],
    ]);
    expect(result.title).toBe('Lit review');
  });

  it('rejects create when project access denied', async () => {
    access.assertCanAccessProject.mockRejectedValue(
      new ForbiddenException('No access'),
    );

    await expect(
      service.create(user, 'proj-other', { title: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists tasks with filters', async () => {
    repository.findMany.mockResolvedValue({ total: 1, tasks: [task] });

    const result = await service.findAll(user, 'proj-1', {
      page: 1,
      pageSize: 20,
      status: TaskStatus.TODO,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('findOne 404 when task belongs to another project', async () => {
    repository.findById.mockResolvedValue({
      ...task,
      projectId: 'other',
    });

    await expect(
      service.findOne(user, 'proj-1', 'task-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates and deletes happily', async () => {
    repository.findById.mockResolvedValue(task);
    repository.update.mockResolvedValue({
      ...task,
      status: TaskStatus.DONE,
    });
    repository.delete.mockResolvedValue(undefined);

    const updated = await service.update(user, 'proj-1', 'task-1', {
      status: TaskStatus.DONE,
    });
    expect(updated.status).toBe(TaskStatus.DONE);

    await service.remove(user, 'proj-1', 'task-1');
    expect(repository.delete.mock.calls).toEqual([['task-1']]);
  });
});
