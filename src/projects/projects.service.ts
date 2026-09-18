import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@quantia/contracts';
import { Prisma, SyncEntityType } from '@prisma/client';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import { NotionSyncEnqueueService } from '../notion/notion-sync-enqueue.service';
import { ProjectResponseDto } from './dto/project-response.dto';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './dto/project.dto';
import {
  ProjectsRepository,
  type ProjectWithMembers,
} from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly projectAccess: ProjectAccessService,
    private readonly notionSync: NotionSyncEnqueueService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    const canCreate =
      this.projectAccess.isAdmin(user) ||
      this.projectAccess.isCoordinator(user);
    if (!canCreate) {
      throw new ForbiddenException(
        'Only administrators or coordinators can create projects',
      );
    }

    const coordinatorId = this.projectAccess.isAdmin(user)
      ? (dto.coordinatorId ?? user.id)
      : user.id;

    if (dto.coordinatorId && this.projectAccess.isCoordinator(user)) {
      if (dto.coordinatorId !== user.id) {
        throw new ForbiddenException(
          'Coordinators can only assign themselves as coordinator',
        );
      }
    }

    const coordinator = await this.projectsRepository.userExists(coordinatorId);
    if (!coordinator) {
      throw new NotFoundException('Coordinator not found');
    }

    const memberIds = [...new Set(dto.memberIds ?? [])];
    for (const memberId of memberIds) {
      const exists = await this.projectsRepository.userExists(memberId);
      if (!exists) {
        throw new NotFoundException(`Member user not found: ${memberId}`);
      }
    }

    const project = await this.projectsRepository.create({
      title: dto.title,
      description: dto.description,
      objectives: dto.objectives,
      status: dto.status,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      coordinatorId,
      createdById: user.id,
      memberIds,
    });

    await this.notionSync.enqueueDbToNotion(SyncEntityType.PROJECT, project.id);
    return this.toResponse(project);
  }

  async findAll(
    user: AuthenticatedUser,
    query: ListProjectsQueryDto,
  ): Promise<PaginatedResult<ProjectResponseDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const accessWhere = this.projectAccess.accessibleProjectWhere(user);

    const where: Prisma.ProjectWhereInput = {
      AND: [
        accessWhere,
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.q
          ? [{ title: { contains: query.q, mode: 'insensitive' as const } }]
          : []),
      ],
    };

    const { total, projects } = await this.projectsRepository.findMany({
      where,
      page,
      pageSize,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    });

    return buildPaginatedResult(
      projects.map((p) => this.toResponse(p)),
      page,
      pageSize,
      total,
    );
  }

  async findOne(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ProjectResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, id);
    const project = await this.projectsRepository.findById(id);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.toResponse(project);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    await this.projectAccess.assertCanManageProject(user, id);

    if (dto.coordinatorId) {
      const exists = await this.projectsRepository.userExists(
        dto.coordinatorId,
      );
      if (!exists) {
        throw new NotFoundException('Coordinator not found');
      }
      if (
        this.projectAccess.isCoordinator(user) &&
        !this.projectAccess.isAdmin(user) &&
        dto.coordinatorId !== user.id
      ) {
        throw new ForbiddenException(
          'Coordinators cannot reassign the coordinator',
        );
      }
    }

    if (dto.memberIds) {
      for (const memberId of dto.memberIds) {
        const exists = await this.projectsRepository.userExists(memberId);
        if (!exists) {
          throw new NotFoundException(`Member user not found: ${memberId}`);
        }
      }
    }

    const project = await this.projectsRepository.update(id, {
      title: dto.title,
      description: dto.description,
      objectives: dto.objectives,
      status: dto.status,
      startDate:
        dto.startDate !== undefined
          ? dto.startDate
            ? new Date(dto.startDate)
            : null
          : undefined,
      endDate:
        dto.endDate !== undefined
          ? dto.endDate
            ? new Date(dto.endDate)
            : null
          : undefined,
      coordinatorId: dto.coordinatorId,
      memberIds: dto.memberIds,
    });

    await this.notionSync.enqueueDbToNotion(SyncEntityType.PROJECT, project.id);
    return this.toResponse(project);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.projectAccess.assertCanManageProject(user, id);
    await this.projectsRepository.delete(id);
  }

  async addMember(
    user: AuthenticatedUser,
    projectId: string,
    dto: AddProjectMemberDto,
  ): Promise<ProjectResponseDto> {
    await this.projectAccess.assertCanManageProject(user, projectId);

    const target = await this.projectsRepository.userExists(dto.userId);
    if (!target) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.projectsRepository.findMember(
      projectId,
      dto.userId,
    );
    if (existing) {
      throw new ConflictException('User is already a project member');
    }

    await this.projectsRepository.addMember(projectId, dto.userId);
    const project = await this.projectsRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.toResponse(project);
  }

  async removeMember(
    user: AuthenticatedUser,
    projectId: string,
    memberUserId: string,
  ): Promise<void> {
    await this.projectAccess.assertCanManageProject(user, projectId);

    const existing = await this.projectsRepository.findMember(
      projectId,
      memberUserId,
    );
    if (!existing) {
      throw new NotFoundException('Project member not found');
    }

    await this.projectsRepository.removeMember(projectId, memberUserId);
  }

  toResponse(project: ProjectWithMembers): ProjectResponseDto {
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      objectives: project.objectives,
      status: project.status,
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
      coordinatorId: project.coordinatorId,
      createdById: project.createdById,
      memberIds: project.members.map((m) => m.userId),
      syncStatus: project.syncStatus,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  /** Exported for tests / Roles decorator usage documentation */
  static readonly createRoles = [
    RoleName.ADMINISTRADOR,
    RoleName.COORDINADOR,
  ] as const;
}
