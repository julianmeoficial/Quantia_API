import { Injectable } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus, type Task } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async findMany(params: {
    where: Prisma.TaskWhereInput;
    page: number;
    pageSize: number;
    sortBy: 'dueDate' | 'priority' | 'createdAt';
    sortOrder: 'asc' | 'desc';
  }): Promise<{ total: number; tasks: Task[] }> {
    const skip = (params.page - 1) * params.pageSize;
    const [total, tasks] = await this.prisma.$transaction([
      this.prisma.task.count({ where: params.where }),
      this.prisma.task.findMany({
        where: params.where,
        skip,
        take: params.pageSize,
        orderBy: { [params.sortBy]: params.sortOrder },
      }),
    ]);
    return { total, tasks };
  }

  create(data: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: Date;
  }): Promise<Task> {
    return this.prisma.task.create({ data });
  }

  update(
    id: string,
    data: {
      title?: string;
      description?: string | null;
      assigneeId?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: Date | null;
    },
  ): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.task.delete({ where: { id } });
  }
}
