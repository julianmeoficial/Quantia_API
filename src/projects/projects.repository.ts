import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProjectStatus,
  type Project,
  type ProjectMember,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type ProjectWithMembers = Project & { members: ProjectMember[] };

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ProjectWithMembers | null> {
    return this.prisma.project.findUnique({
      where: { id },
      include: { members: true },
    });
  }

  async findMany(params: {
    where: Prisma.ProjectWhereInput;
    page: number;
    pageSize: number;
    sortBy: 'createdAt' | 'title' | 'status';
    sortOrder: 'asc' | 'desc';
  }): Promise<{ total: number; projects: ProjectWithMembers[] }> {
    const skip = (params.page - 1) * params.pageSize;
    const [total, projects] = await this.prisma.$transaction([
      this.prisma.project.count({ where: params.where }),
      this.prisma.project.findMany({
        where: params.where,
        skip,
        take: params.pageSize,
        orderBy: { [params.sortBy]: params.sortOrder },
        include: { members: true },
      }),
    ]);
    return { total, projects };
  }

  create(data: {
    title: string;
    description?: string;
    objectives?: string;
    status?: ProjectStatus;
    startDate?: Date;
    endDate?: Date;
    coordinatorId: string;
    createdById: string;
    memberIds: string[];
  }): Promise<ProjectWithMembers> {
    return this.prisma.project.create({
      data: {
        title: data.title,
        description: data.description,
        objectives: data.objectives,
        status: data.status,
        startDate: data.startDate,
        endDate: data.endDate,
        coordinatorId: data.coordinatorId,
        createdById: data.createdById,
        members: {
          create: data.memberIds.map((userId) => ({ userId })),
        },
      },
      include: { members: true },
    });
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string | null;
      objectives?: string | null;
      status?: ProjectStatus;
      startDate?: Date | null;
      endDate?: Date | null;
      coordinatorId?: string;
      memberIds?: string[];
    },
  ): Promise<ProjectWithMembers> {
    return this.prisma.$transaction(async (tx) => {
      if (data.memberIds) {
        await tx.projectMember.deleteMany({ where: { projectId: id } });
        if (data.memberIds.length > 0) {
          await tx.projectMember.createMany({
            data: data.memberIds.map((userId) => ({
              projectId: id,
              userId,
            })),
          });
        }
      }

      return tx.project.update({
        where: { id },
        data: {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          ...(data.objectives !== undefined
            ? { objectives: data.objectives }
            : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.startDate !== undefined
            ? { startDate: data.startDate }
            : {}),
          ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
          ...(data.coordinatorId !== undefined
            ? { coordinatorId: data.coordinatorId }
            : {}),
        },
        include: { members: true },
      });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.project.delete({ where: { id } });
  }

  async addMember(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectMember.create({
      data: { projectId, userId },
    });
  }

  async removeMember(projectId: string, userId: string): Promise<void> {
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  findMember(projectId: string, userId: string) {
    return this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  userExists(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
  }
}
