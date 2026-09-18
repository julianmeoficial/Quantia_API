import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { ProjectStatus, SyncStatus } from '@prisma/client';
import { ProjectAccessService } from '../common/project-access.service';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let repository: jest.Mocked<ProjectsRepository>;
  let access: jest.Mocked<ProjectAccessService>;

  const admin: AuthenticatedUser = {
    id: 'admin-id',
    email: 'admin@test.com',
    roles: [RoleName.ADMINISTRADOR],
  };
  const coord: AuthenticatedUser = {
    id: 'coord-id',
    email: 'coord@test.com',
    roles: [RoleName.COORDINADOR],
  };
  const researcher: AuthenticatedUser = {
    id: 'res-id',
    email: 'res@test.com',
    roles: [RoleName.INVESTIGADOR],
  };

  const baseProject = {
    id: 'proj-1',
    title: 'Alpha',
    description: null,
    objectives: null,
    status: ProjectStatus.ACTIVE,
    startDate: null,
    endDate: null,
    coordinatorId: 'coord-id',
    createdById: 'admin-id',
    notionPageId: null,
    lastEditedTime: null,
    syncedAt: null,
    syncStatus: SyncStatus.PENDING,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    members: [{ projectId: 'proj-1', userId: 'res-id', joinedAt: new Date() }],
  };

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      addMember: jest.fn(),
      removeMember: jest.fn(),
      findMember: jest.fn(),
      userExists: jest.fn(),
    } as unknown as jest.Mocked<ProjectsRepository>;

    access = {
      isAdmin: jest.fn((u: AuthenticatedUser) =>
        u.roles.includes(RoleName.ADMINISTRADOR),
      ),
      isCoordinator: jest.fn((u: AuthenticatedUser) =>
        u.roles.includes(RoleName.COORDINADOR),
      ),
      accessibleProjectWhere: jest.fn(),
      assertCanAccessProject: jest.fn(),
      assertCanManageProject: jest.fn(),
      assertUserIsProjectMember: jest.fn(),
    } as unknown as jest.Mocked<ProjectAccessService>;

    const notionSync = {
      enqueueDbToNotion: jest.fn().mockResolvedValue(undefined),
      enqueueNotionToDb: jest.fn().mockResolvedValue(undefined),
    };

    service = new ProjectsService(
      repository,
      access,
      notionSync as never,
      {
        emitProyectoRetrasado: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  });

  it('forbids investigators from creating projects', async () => {
    await expect(
      service.create(researcher, { title: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates project for coordinator with self as coordinator', async () => {
    repository.userExists.mockResolvedValue({ id: coord.id });
    repository.create.mockResolvedValue(baseProject);

    const result = await service.create(coord, { title: 'Alpha' });

    expect(repository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        title: 'Alpha',
        coordinatorId: coord.id,
        createdById: coord.id,
      }),
    );
    expect(result.id).toBe('proj-1');
    expect(result.memberIds).toEqual(['res-id']);
  });

  it('admin can create with explicit coordinator and members', async () => {
    repository.userExists.mockResolvedValue({ id: 'x' });
    repository.create.mockResolvedValue(baseProject);

    await service.create(admin, {
      title: 'Admin Project',
      coordinatorId: 'coord-id',
      memberIds: ['res-id'],
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
    });

    expect(repository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        coordinatorId: 'coord-id',
        memberIds: ['res-id'],
      }),
    );
  });

  it('coordinator cannot assign another coordinator', async () => {
    await expect(
      service.create(coord, {
        title: 'X',
        coordinatorId: 'other-coord',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create 404 when coordinator missing', async () => {
    repository.userExists.mockResolvedValue(null);
    await expect(
      service.create(admin, { title: 'X', coordinatorId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create 404 when member missing', async () => {
    repository.userExists
      .mockResolvedValueOnce({ id: admin.id })
      .mockResolvedValueOnce(null);
    await expect(
      service.create(admin, {
        title: 'X',
        memberIds: ['missing-member'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists with access filter and pagination', async () => {
    access.accessibleProjectWhere.mockReturnValue({
      members: { some: { userId: researcher.id } },
    });
    repository.findMany.mockResolvedValue({
      total: 1,
      projects: [baseProject],
    });

    const result = await service.findAll(researcher, {
      page: 1,
      pageSize: 10,
      sortBy: 'title',
      sortOrder: 'asc',
      status: ProjectStatus.ACTIVE,
      q: 'Alpha',
    });

    expect(result.meta.total).toBe(1);
    expect(result.data[0].title).toBe('Alpha');
  });

  it('findOne checks access then returns project', async () => {
    access.assertCanAccessProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.findById.mockResolvedValue(baseProject);

    const result = await service.findOne(researcher, 'proj-1');
    expect(result.title).toBe('Alpha');
  });

  it('findOne 404 when missing after access', async () => {
    access.assertCanAccessProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.findById.mockResolvedValue(null);
    await expect(service.findOne(researcher, 'proj-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update requires manage access', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.update.mockResolvedValue({
      ...baseProject,
      title: 'Beta',
    });

    const result = await service.update(coord, 'proj-1', {
      title: 'Beta',
      startDate: '2026-02-01T00:00:00.000Z',
      endDate: null as unknown as undefined,
    });
    expect(result.title).toBe('Beta');
  });

  it('update forbids coordinator reassignment by coordinator', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.userExists.mockResolvedValue({ id: 'other' });

    await expect(
      service.update(coord, 'proj-1', { coordinatorId: 'other' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update 404 when member missing', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.userExists.mockResolvedValue(null);

    await expect(
      service.update(admin, 'proj-1', { memberIds: ['missing'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove requires manage access', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.delete.mockResolvedValue(undefined);

    await service.remove(admin, 'proj-1');
    expect(repository.delete.mock.calls).toEqual([['proj-1']]);
  });

  it('addMember rejects duplicates', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.userExists.mockResolvedValue({ id: 'res-id' });
    repository.findMember.mockResolvedValue({
      projectId: 'proj-1',
      userId: 'res-id',
      joinedAt: new Date(),
    });

    await expect(
      service.addMember(coord, 'proj-1', { userId: 'res-id' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('addMember 404 when user missing', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.userExists.mockResolvedValue(null);

    await expect(
      service.addMember(coord, 'proj-1', { userId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('addMember succeeds for new member', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.userExists.mockResolvedValue({ id: 'new-user' });
    repository.findMember.mockResolvedValue(null);
    repository.addMember.mockResolvedValue(undefined);
    repository.findById.mockResolvedValue({
      ...baseProject,
      members: [
        ...baseProject.members,
        { projectId: 'proj-1', userId: 'new-user', joinedAt: new Date() },
      ],
    });

    const result = await service.addMember(coord, 'proj-1', {
      userId: 'new-user',
    });
    expect(result.memberIds).toContain('new-user');
  });

  it('removeMember throws when missing', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.findMember.mockResolvedValue(null);

    await expect(
      service.removeMember(coord, 'proj-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removeMember succeeds', async () => {
    access.assertCanManageProject.mockResolvedValue({
      id: 'proj-1',
      coordinatorId: 'coord-id',
    });
    repository.findMember.mockResolvedValue({
      projectId: 'proj-1',
      userId: 'res-id',
      joinedAt: new Date(),
    });
    repository.removeMember.mockResolvedValue(undefined);

    await service.removeMember(coord, 'proj-1', 'res-id');
    expect(repository.removeMember.mock.calls).toEqual([['proj-1', 'res-id']]);
  });
});
