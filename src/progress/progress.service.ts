import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SyncEntityType, type Progress } from '@prisma/client';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { NotionSyncEnqueueService } from '../notion/notion-sync-enqueue.service';
import { ProgressResponseDto } from './dto/progress-response.dto';
import {
  CreateProgressDto,
  ListProgressQueryDto,
  UpdateProgressDto,
} from './dto/progress.dto';
import { ProgressRepository } from './progress.repository';

@Injectable()
export class ProgressService {
  constructor(
    private readonly progressRepository: ProgressRepository,
    private readonly projectAccess: ProjectAccessService,
    private readonly notionSync: NotionSyncEnqueueService,
  ) {}

  async create(
    user: AuthenticatedUser,
    projectId: string,
    dto: CreateProgressDto,
  ): Promise<ProgressResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);

    if (dto.taskId) {
      const task = await this.progressRepository.findTaskInProject(
        dto.taskId,
        projectId,
      );
      if (!task) {
        throw new BadRequestException('Task does not belong to this project');
      }
    }

    const entry = await this.progressRepository.create({
      projectId,
      taskId: dto.taskId,
      authorId: user.id,
      title: dto.title,
      description: dto.description,
      evidenceLinks: dto.evidenceLinks ?? [],
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined,
    });

    await this.notionSync.enqueueDbToNotion(SyncEntityType.PROGRESS, entry.id);
    return this.toResponse(entry);
  }

  async findAll(
    user: AuthenticatedUser,
    projectId: string,
    query: ListProgressQueryDto,
  ): Promise<PaginatedResult<ProgressResponseDto>> {
    await this.projectAccess.assertCanAccessProject(user, projectId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ProgressWhereInput = {
      projectId,
      ...(query.taskId ? { taskId: query.taskId } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
    };

    const { total, entries } = await this.progressRepository.findMany({
      where,
      page,
      pageSize,
      sortBy: query.sortBy ?? 'recordedAt',
      sortOrder: query.sortOrder ?? 'desc',
    });

    return buildPaginatedResult(
      entries.map((e) => this.toResponse(e)),
      page,
      pageSize,
      total,
    );
  }

  async findOne(
    user: AuthenticatedUser,
    projectId: string,
    progressId: string,
  ): Promise<ProgressResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const entry = await this.progressRepository.findById(progressId);
    if (!entry || entry.projectId !== projectId) {
      throw new NotFoundException('Progress entry not found');
    }
    return this.toResponse(entry);
  }

  async update(
    user: AuthenticatedUser,
    projectId: string,
    progressId: string,
    dto: UpdateProgressDto,
  ): Promise<ProgressResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const existing = await this.progressRepository.findById(progressId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('Progress entry not found');
    }

    if (dto.taskId) {
      const task = await this.progressRepository.findTaskInProject(
        dto.taskId,
        projectId,
      );
      if (!task) {
        throw new BadRequestException('Task does not belong to this project');
      }
    }

    const entry = await this.progressRepository.update(progressId, {
      title: dto.title,
      description: dto.description,
      taskId: dto.taskId,
      evidenceLinks: dto.evidenceLinks,
      recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined,
    });

    await this.notionSync.enqueueDbToNotion(SyncEntityType.PROGRESS, entry.id);
    return this.toResponse(entry);
  }

  async remove(
    user: AuthenticatedUser,
    projectId: string,
    progressId: string,
  ): Promise<void> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const existing = await this.progressRepository.findById(progressId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('Progress entry not found');
    }
    await this.progressRepository.delete(progressId);
  }

  toResponse(entry: Progress): ProgressResponseDto {
    return {
      id: entry.id,
      projectId: entry.projectId,
      taskId: entry.taskId,
      authorId: entry.authorId,
      title: entry.title,
      description: entry.description,
      evidenceLinks: entry.evidenceLinks,
      recordedAt: entry.recordedAt.toISOString(),
      syncStatus: entry.syncStatus,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
