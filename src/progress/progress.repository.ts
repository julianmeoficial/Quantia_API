import { Injectable } from '@nestjs/common';
import { Prisma, type Progress } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Progress | null> {
    return this.prisma.progress.findUnique({ where: { id } });
  }

  async findMany(params: {
    where: Prisma.ProgressWhereInput;
    page: number;
    pageSize: number;
    sortBy: 'recordedAt' | 'createdAt';
    sortOrder: 'asc' | 'desc';
  }): Promise<{ total: number; entries: Progress[] }> {
    const skip = (params.page - 1) * params.pageSize;
    const [total, entries] = await this.prisma.$transaction([
      this.prisma.progress.count({ where: params.where }),
      this.prisma.progress.findMany({
        where: params.where,
        skip,
        take: params.pageSize,
        orderBy: { [params.sortBy]: params.sortOrder },
      }),
    ]);
    return { total, entries };
  }

  create(data: {
    projectId: string;
    taskId?: string;
    authorId: string;
    title: string;
    description: string;
    evidenceLinks: string[];
    recordedAt?: Date;
  }): Promise<Progress> {
    return this.prisma.progress.create({ data });
  }

  update(
    id: string,
    data: {
      title?: string;
      description?: string;
      taskId?: string | null;
      evidenceLinks?: string[];
      recordedAt?: Date;
    },
  ): Promise<Progress> {
    return this.prisma.progress.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.progress.delete({ where: { id } });
  }

  findTaskInProject(taskId: string, projectId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
  }
}
