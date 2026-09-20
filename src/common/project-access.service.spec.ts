import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { ProjectAccessService } from './project-access.service';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import { PrismaService } from '../database/prisma.service';

describe('ProjectAccessService', () => {
  let service: ProjectAccessService;
  let prisma: {
    project: { findUnique: jest.Mock };
    projectMember: { findUnique: jest.Mock };
  };

  const admin: AuthenticatedUser = {
    id: 'a',
    email: 'a@t.com',
    roles: [RoleName.ADMINISTRADOR],
  };
  const coord: AuthenticatedUser = {
    id: 'c',
    email: 'c@t.com',
    roles: [RoleName.COORDINADOR],
  };
  const res: AuthenticatedUser = {
    id: 'r',
    email: 'r@t.com',
    roles: [RoleName.INVESTIGADOR],
  };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn() },
      projectMember: { findUnique: jest.fn() },
    };
    service = new ProjectAccessService(prisma as unknown as PrismaService);
  });

  it('admin has unrestricted where', () => {
    expect(service.accessibleProjectWhere(admin)).toEqual({});
  });

  it('coordinator where includes coordinatorId OR membership', () => {
    const where = service.accessibleProjectWhere(coord);
    expect(where).toEqual({
      OR: [{ members: { some: { userId: 'c' } } }, { coordinatorId: 'c' }],
    });
  });

  it('assertCanAccessProject 404 when missing', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(
      service.assertCanAccessProject(res, 'p1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertCanAccessProject allows member', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      coordinatorId: 'other',
    });
    prisma.projectMember.findUnique.mockResolvedValue({
      projectId: 'p1',
      userId: 'r',
    });

    await expect(service.assertCanAccessProject(res, 'p1')).resolves.toEqual({
      id: 'p1',
      coordinatorId: 'other',
    });
  });

  it('assertCanAccessProject forbids non-member', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      coordinatorId: 'other',
    });
    prisma.projectMember.findUnique.mockResolvedValue(null);

    await expect(
      service.assertCanAccessProject(res, 'p1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertCanManageProject forbids plain member', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      coordinatorId: 'c',
    });
    prisma.projectMember.findUnique.mockResolvedValue({
      projectId: 'p1',
      userId: 'r',
    });

    await expect(
      service.assertCanManageProject(res, 'p1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertCanManageProject allows coordinator of project', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      coordinatorId: 'c',
    });

    await expect(service.assertCanManageProject(coord, 'p1')).resolves.toEqual({
      id: 'p1',
      coordinatorId: 'c',
    });
  });

  it('assertCanMutateOwnedResource allows owner without manage', async () => {
    await expect(
      service.assertCanMutateOwnedResource(res, 'p1', 'r'),
    ).resolves.toBeUndefined();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it('assertCanMutateOwnedResource falls back to manage for non-owner', async () => {
    prisma.project.findUnique.mockResolvedValue({
      id: 'p1',
      coordinatorId: 'c',
    });
    prisma.projectMember.findUnique.mockResolvedValue({
      projectId: 'p1',
      userId: 'r',
    });

    await expect(
      service.assertCanMutateOwnedResource(res, 'p1', 'other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertUserIsProjectMember allows coordinator', async () => {
    prisma.project.findUnique.mockResolvedValue({ coordinatorId: 'c' });
    await expect(
      service.assertUserIsProjectMember('p1', 'c'),
    ).resolves.toBeUndefined();
  });

  it('assertUserIsProjectMember forbids outsider', async () => {
    prisma.project.findUnique.mockResolvedValue({ coordinatorId: 'c' });
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(
      service.assertUserIsProjectMember('p1', 'outsider'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
