import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SyncEntityType, type Task } from '@prisma/client';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { NotionSyncEnqueueService } from '../notion/notion-sync-enqueue.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter.service';
import { TaskResponseDto } from './dto/task-response.dto';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly projectAccess: ProjectAccessService,
    private readonly notionSync: NotionSyncEnqueueService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async create(
    user: AuthenticatedUser,
    projectId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);

    if (dto.assigneeId) {
      await this.projectAccess.assertUserIsProjectMember(
        projectId,
        dto.assigneeId,
      );
    }

    const task = await this.tasksRepository.create({
      projectId,
      title: dto.title,
      description: dto.description,
      assigneeId: dto.assigneeId,
      status: dto.status,
      priority: dto.priority,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    });

    await this.notionSync.enqueueDbToNotion(SyncEntityType.TASK, task.id);
    await this.emitTaskUpdated(task);
    return this.toResponse(task);
  }

  async findAll(
    user: AuthenticatedUser,
    projectId: string,
    query: ListTasksQueryDto,
  ): Promise<PaginatedResult<TaskResponseDto>> {
    await this.projectAccess.assertCanAccessProject(user, projectId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.TaskWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    };

    const { total, tasks } = await this.tasksRepository.findMany({
      where,
      page,
      pageSize,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    });

    return buildPaginatedResult(
      tasks.map((t) => this.toResponse(t)),
      page,
      pageSize,
      total,
    );
  }

  async findOne(
    user: AuthenticatedUser,
    projectId: string,
    taskId: string,
  ): Promise<TaskResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const task = await this.tasksRepository.findById(taskId);
    if (!task || task.projectId !== projectId) {
      throw new NotFoundException('Task not found');
    }
    return this.toResponse(task);
  }

  async update(
    user: AuthenticatedUser,
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const existing = await this.tasksRepository.findById(taskId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('Task not found');
    }

    if (dto.assigneeId) {
      await this.projectAccess.assertUserIsProjectMember(
        projectId,
        dto.assigneeId,
      );
    }

    const task = await this.tasksRepository.update(taskId, {
      title: dto.title,
      description: dto.description,
      assigneeId: dto.assigneeId,
      status: dto.status,
      priority: dto.priority,
      dueDate:
        dto.dueDate !== undefined
          ? dto.dueDate
            ? new Date(dto.dueDate)
            : null
          : undefined,
    });

    await this.notionSync.enqueueDbToNotion(SyncEntityType.TASK, task.id);
    await this.emitTaskUpdated(task);
    return this.toResponse(task);
  }

  async remove(
    user: AuthenticatedUser,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const existing = await this.tasksRepository.findById(taskId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('Task not found');
    }
    await this.tasksRepository.delete(taskId);
  }

  toResponse(task: Task): TaskResponseDto {
    return {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      assigneeId: task.assigneeId,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.toISOString() ?? null,
      syncStatus: task.syncStatus,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private async emitTaskUpdated(task: Task): Promise<void> {
    await this.realtime.emitTareaActualizada({
      projectId: task.projectId,
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      updatedAt: task.updatedAt.toISOString(),
    });
  }
}
