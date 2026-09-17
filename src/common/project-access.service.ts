import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes(RoleName.ADMINISTRADOR);
  }

  isCoordinator(user: AuthenticatedUser): boolean {
    return user.roles.includes(RoleName.COORDINADOR);
  }

  accessibleProjectWhere(user: AuthenticatedUser): Prisma.ProjectWhereInput {
    if (this.isAdmin(user)) {
      return {};
    }

    const or: Prisma.ProjectWhereInput[] = [
      { members: { some: { userId: user.id } } },
    ];

    if (this.isCoordinator(user)) {
      or.push({ coordinatorId: user.id });
    }

    return { OR: or };
  }

  async assertCanAccessProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<{ id: string; coordinatorId: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, coordinatorId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (this.isAdmin(user)) {
      return project;
    }

    if (this.isCoordinator(user) && project.coordinatorId === user.id) {
      return project;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId: user.id },
      },
    });

    if (!membership) {
      throw new ForbiddenException('No access to this project');
    }

    return project;
  }

  async assertCanManageProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<{ id: string; coordinatorId: string }> {
    const project = await this.assertCanAccessProject(user, projectId);

    if (this.isAdmin(user)) {
      return project;
    }

    if (this.isCoordinator(user) && project.coordinatorId === user.id) {
      return project;
    }

    throw new ForbiddenException(
      'Only admin or project coordinator can manage',
    );
  }

  async assertUserIsProjectMember(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { coordinatorId: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.coordinatorId === userId) {
      return;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Assignee must be a project member');
    }
  }
}
