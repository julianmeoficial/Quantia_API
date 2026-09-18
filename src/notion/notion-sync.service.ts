import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RoleName,
  SyncEntityType,
  SyncEventStatus,
  SyncStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type { EnvConfig } from '../config/env.schema';
import { NotionClient } from './notion.client';
import * as mapper from './notion.mapper';

type NotionPageLike = {
  id: string;
  last_edited_time?: string;
  parent?: { type?: string; database_id?: string; data_source_id?: string };
  properties?: Record<string, unknown>;
};

@Injectable()
export class NotionSyncService {
  private readonly logger = new Logger(NotionSyncService.name);

  constructor(
    private readonly notion: NotionClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async syncNotionPageToDb(params: {
    notionPageId: string;
    entityType?: SyncEntityType;
    lastEditedTime?: string;
    syncEventId?: string;
    attempt: number;
  }): Promise<void> {
    if (params.syncEventId) {
      await this.prisma.syncEvent.update({
        where: { id: params.syncEventId },
        data: {
          status: SyncEventStatus.PROCESSING,
          attempts: params.attempt,
        },
      });
    }

    const page = (await this.notion.getPage(
      params.notionPageId,
    )) as NotionPageLike;
    const props = page.properties ?? {};
    const editedAt = new Date(
      params.lastEditedTime ?? page.last_edited_time ?? Date.now(),
    );
    const entityType = params.entityType ?? this.detectEntityType(page);

    const existing = await this.findByNotionPageId(entityType, page.id);
    if (
      existing?.syncedAt &&
      existing.lastEditedTime &&
      editedAt.getTime() <= existing.syncedAt.getTime()
    ) {
      if (params.syncEventId) {
        await this.prisma.syncEvent.update({
          where: { id: params.syncEventId },
          data: { status: SyncEventStatus.DUPLICATE },
        });
      }
      this.logger.log(`Duplicate event skipped for ${page.id}`);
      return;
    }

    switch (entityType) {
      case SyncEntityType.USER:
        await this.upsertUserFromNotion(page, props, editedAt);
        break;
      case SyncEntityType.PROJECT:
        await this.upsertProjectFromNotion(page, props, editedAt);
        break;
      case SyncEntityType.TASK:
        await this.upsertTaskFromNotion(page, props, editedAt);
        break;
      case SyncEntityType.PROGRESS:
        await this.upsertProgressFromNotion(page, props, editedAt);
        break;
    }

    if (params.syncEventId) {
      await this.prisma.syncEvent.update({
        where: { id: params.syncEventId },
        data: {
          status: SyncEventStatus.SYNCED,
          entityType,
          notionPageId: page.id,
        },
      });
    }
  }

  async syncEntityToNotion(params: {
    entityType: SyncEntityType;
    entityId: string;
    syncEventId?: string;
    attempt: number;
  }): Promise<void> {
    if (params.syncEventId) {
      await this.prisma.syncEvent.update({
        where: { id: params.syncEventId },
        data: {
          status: SyncEventStatus.PROCESSING,
          attempts: params.attempt,
        },
      });
    }

    switch (params.entityType) {
      case SyncEntityType.USER:
        await this.pushUser(params.entityId);
        break;
      case SyncEntityType.PROJECT:
        await this.pushProject(params.entityId);
        break;
      case SyncEntityType.TASK:
        await this.pushTask(params.entityId);
        break;
      case SyncEntityType.PROGRESS:
        await this.pushProgress(params.entityId);
        break;
    }

    if (params.syncEventId) {
      await this.prisma.syncEvent.update({
        where: { id: params.syncEventId },
        data: { status: SyncEventStatus.SYNCED },
      });
    }
  }

  async markFailed(
    syncEventId: string | undefined,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Unknown sync error';
    this.logger.error(`Notion sync failed: ${message}`);
    if (!syncEventId) return;
    await this.prisma.syncEvent.update({
      where: { id: syncEventId },
      data: {
        status: SyncEventStatus.FAILED,
        errorMessage: message.slice(0, 4000),
      },
    });
  }

  private detectEntityType(page: NotionPageLike): SyncEntityType {
    const parentId =
      page.parent?.database_id ?? page.parent?.data_source_id ?? '';
    const dbUsers = this.config.get('NOTION_DB_USERS', { infer: true });
    const dsUsers = this.config.get('NOTION_DS_USERS', { infer: true });
    const dbProjects = this.config.get('NOTION_DB_PROJECTS', { infer: true });
    const dsProjects = this.config.get('NOTION_DS_PROJECTS', { infer: true });
    const dbTasks = this.config.get('NOTION_DB_TASKS', { infer: true });
    const dsTasks = this.config.get('NOTION_DS_TASKS', { infer: true });
    const dbProgress = this.config.get('NOTION_DB_PROGRESS', { infer: true });
    const dsProgress = this.config.get('NOTION_DS_PROGRESS', { infer: true });

    const normalized = parentId.replace(/-/g, '');
    const match = (id: string) => id.replace(/-/g, '') === normalized;

    if (match(dbUsers) || match(dsUsers)) return SyncEntityType.USER;
    if (match(dbProjects) || match(dsProjects)) return SyncEntityType.PROJECT;
    if (match(dbTasks) || match(dsTasks)) return SyncEntityType.TASK;
    if (match(dbProgress) || match(dsProgress)) return SyncEntityType.PROGRESS;
    return SyncEntityType.PROJECT;
  }

  private async findByNotionPageId(
    entityType: SyncEntityType,
    notionPageId: string,
  ) {
    switch (entityType) {
      case SyncEntityType.USER:
        return this.prisma.user.findUnique({ where: { notionPageId } });
      case SyncEntityType.PROJECT:
        return this.prisma.project.findUnique({ where: { notionPageId } });
      case SyncEntityType.TASK:
        return this.prisma.task.findUnique({ where: { notionPageId } });
      case SyncEntityType.PROGRESS:
        return this.prisma.progress.findUnique({ where: { notionPageId } });
    }
  }

  private async upsertUserFromNotion(
    page: NotionPageLike,
    props: Record<string, unknown>,
    editedAt: Date,
  ): Promise<void> {
    const email =
      mapper.emailFromProp(props, 'Email')?.toLowerCase() ??
      `${page.id.replace(/-/g, '')}@notion.local`;
    const fullName = mapper.plainTextFromTitle(props, 'Nombre') || email;
    const role = mapper.mapRoleName(mapper.selectName(props, 'Rol'));
    const isActive = mapper.checkboxFromProp(props, 'Activo');
    const roleRow = await this.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });

    const existingByNotion = await this.prisma.user.findUnique({
      where: { notionPageId: page.id },
    });
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
    });

    const syncMeta = {
      notionPageId: page.id,
      lastEditedTime: editedAt,
      syncedAt: new Date(),
      syncStatus: SyncStatus.SYNCED,
    };

    if (existingByNotion || existingByEmail) {
      const id = (existingByNotion ?? existingByEmail)!.id;
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: { email, fullName, isActive, ...syncMeta },
        });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({
          data: { userId: id, roleId: roleRow.id },
        });
      });
      await this.writePgId(page.id, id);
      return;
    }

    const passwordHash = await argon2.hash(randomBytes(24).toString('hex'));
    const created = await this.prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        isActive,
        ...syncMeta,
        userRoles: { create: [{ roleId: roleRow.id }] },
      },
    });
    await this.writePgId(page.id, created.id);
  }

  private async upsertProjectFromNotion(
    page: NotionPageLike,
    props: Record<string, unknown>,
    editedAt: Date,
  ): Promise<void> {
    const title = mapper.plainTextFromTitle(props, 'Nombre') || 'Untitled';
    const description = mapper.plainTextFromRichText(props, 'Descripción');
    const status = mapper.mapProjectStatus(mapper.statusName(props, 'Estado'));
    const startDate = mapper.dateStart(props, 'Fechas');
    const endDate = mapper.dateEnd(props, 'Fechas');

    const fallbackUser = await this.prisma.user.findFirst({
      where: {
        userRoles: { some: { role: { name: RoleName.ADMINISTRADOR } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!fallbackUser) {
      throw new Error('No admin user available to own Notion project');
    }

    const syncMeta = {
      notionPageId: page.id,
      lastEditedTime: editedAt,
      syncedAt: new Date(),
      syncStatus: SyncStatus.SYNCED,
    };

    const existing = await this.prisma.project.findUnique({
      where: { notionPageId: page.id },
    });
    if (existing) {
      await this.prisma.project.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          status,
          startDate,
          endDate,
          ...syncMeta,
        },
      });
      await this.writePgId(page.id, existing.id);
      return;
    }

    const created = await this.prisma.project.create({
      data: {
        title,
        description,
        status,
        startDate,
        endDate,
        coordinatorId: fallbackUser.id,
        createdById: fallbackUser.id,
        ...syncMeta,
      },
    });
    await this.writePgId(page.id, created.id);
  }

  private async upsertTaskFromNotion(
    page: NotionPageLike,
    props: Record<string, unknown>,
    editedAt: Date,
  ): Promise<void> {
    const title = mapper.plainTextFromTitle(props, 'Título') || 'Untitled';
    const description = mapper.plainTextFromRichText(props, 'Notas/Bloqueos');
    const status = mapper.mapTaskStatus(mapper.statusName(props, 'Estado'));
    const priority = mapper.mapTaskPriority(
      mapper.selectName(props, 'Prioridad'),
    );
    const dueDate = mapper.dateStart(props, 'Fecha límite');
    const projectNotionId = mapper.relationIds(props, 'Proyecto')[0];
    const assigneeNotionId = mapper.relationIds(props, 'Responsable')[0];

    if (!projectNotionId) {
      throw new Error('Task missing Proyecto relation; leaving pending');
    }
    const project = await this.prisma.project.findUnique({
      where: { notionPageId: projectNotionId },
    });
    if (!project) {
      throw new Error(`Parent project ${projectNotionId} not synced yet`);
    }

    let assigneeId: string | null = null;
    if (assigneeNotionId) {
      const assignee = await this.prisma.user.findUnique({
        where: { notionPageId: assigneeNotionId },
      });
      assigneeId = assignee?.id ?? null;
    }

    const syncMeta = {
      notionPageId: page.id,
      lastEditedTime: editedAt,
      syncedAt: new Date(),
      syncStatus: SyncStatus.SYNCED,
    };

    const existing = await this.prisma.task.findUnique({
      where: { notionPageId: page.id },
    });
    if (existing) {
      await this.prisma.task.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          status,
          priority,
          dueDate,
          projectId: project.id,
          assigneeId,
          ...syncMeta,
        },
      });
      await this.writePgId(page.id, existing.id);
      return;
    }

    const created = await this.prisma.task.create({
      data: {
        title,
        description,
        status,
        priority,
        dueDate,
        projectId: project.id,
        assigneeId,
        ...syncMeta,
      },
    });
    await this.writePgId(page.id, created.id);
  }

  private async upsertProgressFromNotion(
    page: NotionPageLike,
    props: Record<string, unknown>,
    editedAt: Date,
  ): Promise<void> {
    const title = mapper.plainTextFromTitle(props, 'Título') || 'Untitled';
    const description =
      mapper.plainTextFromRichText(props, 'Descripción') || title;
    const recordedAt = mapper.dateStart(props, 'Fecha') ?? editedAt;
    const evidence = mapper.urlFromProp(props, 'Evidencia (URL firmada)');
    const projectNotionId = mapper.relationIds(props, 'Proyecto')[0];
    const taskNotionId = mapper.relationIds(props, 'Tarea')[0];
    const authorNotionId = mapper.relationIds(props, 'Autor')[0];

    if (!projectNotionId) {
      throw new Error('Progress missing Proyecto relation');
    }
    const project = await this.prisma.project.findUnique({
      where: { notionPageId: projectNotionId },
    });
    if (!project) {
      throw new Error(`Parent project ${projectNotionId} not synced yet`);
    }

    let taskId: string | null = null;
    if (taskNotionId) {
      const task = await this.prisma.task.findUnique({
        where: { notionPageId: taskNotionId },
      });
      taskId = task?.id ?? null;
    }

    let authorId = project.createdById;
    if (authorNotionId) {
      const author = await this.prisma.user.findUnique({
        where: { notionPageId: authorNotionId },
      });
      if (author) authorId = author.id;
    }

    const syncMeta = {
      notionPageId: page.id,
      lastEditedTime: editedAt,
      syncedAt: new Date(),
      syncStatus: SyncStatus.SYNCED,
    };

    const existing = await this.prisma.progress.findUnique({
      where: { notionPageId: page.id },
    });
    if (existing) {
      await this.prisma.progress.update({
        where: { id: existing.id },
        data: {
          title,
          description,
          recordedAt,
          evidenceLinks: evidence ? [evidence] : [],
          projectId: project.id,
          taskId,
          authorId,
          ...syncMeta,
        },
      });
      await this.writePgId(page.id, existing.id);
      return;
    }

    const created = await this.prisma.progress.create({
      data: {
        title,
        description,
        recordedAt,
        evidenceLinks: evidence ? [evidence] : [],
        projectId: project.id,
        taskId,
        authorId,
        ...syncMeta,
      },
    });
    await this.writePgId(page.id, created.id);
  }

  private async pushUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    const role = user.userRoles[0]?.role.name ?? RoleName.INVESTIGADOR;
    const properties = {
      Nombre: mapper.titleProperty(user.fullName),
      Email: mapper.emailProperty(user.email),
      Rol: mapper.selectProperty(mapper.roleNameToNotion(role)),
      Activo: mapper.checkboxProperty(user.isActive),
      pg_id: mapper.richTextProperty(user.id),
      sync_status: mapper.selectProperty(
        mapper.syncStatusToNotion(SyncStatus.SYNCED),
      ),
      synced_at: mapper.dateProperty(new Date()),
    };
    const dbId = this.config.get('NOTION_DB_USERS', { infer: true });
    const page = user.notionPageId
      ? await this.notion.updatePage(user.notionPageId, properties)
      : await this.notion.createPage({
          parentDatabaseId: dbId,
          properties,
        });
    await this.prisma.user.update({
      where: { id },
      data: {
        notionPageId: page.id,
        syncedAt: new Date(),
        lastEditedTime: new Date(
          'last_edited_time' in page &&
            typeof page.last_edited_time === 'string'
            ? page.last_edited_time
            : Date.now(),
        ),
        syncStatus: SyncStatus.SYNCED,
      },
    });
  }

  private async pushProject(id: string): Promise<void> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id },
    });
    const properties = {
      Nombre: mapper.titleProperty(project.title),
      Descripción: mapper.richTextProperty(project.description),
      Estado: mapper.statusProperty(
        mapper.projectStatusToNotion(project.status),
      ),
      Fechas: mapper.dateProperty(project.startDate, project.endDate),
      pg_id: mapper.richTextProperty(project.id),
      sync_status: mapper.selectProperty(
        mapper.syncStatusToNotion(SyncStatus.SYNCED),
      ),
      synced_at: mapper.dateProperty(new Date()),
    };
    const dbId = this.config.get('NOTION_DB_PROJECTS', { infer: true });
    const page = project.notionPageId
      ? await this.notion.updatePage(project.notionPageId, properties)
      : await this.notion.createPage({
          parentDatabaseId: dbId,
          properties,
        });
    await this.prisma.project.update({
      where: { id },
      data: {
        notionPageId: page.id,
        syncedAt: new Date(),
        lastEditedTime: new Date(
          'last_edited_time' in page &&
            typeof page.last_edited_time === 'string'
            ? page.last_edited_time
            : Date.now(),
        ),
        syncStatus: SyncStatus.SYNCED,
      },
    });
  }

  private async pushTask(id: string): Promise<void> {
    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id },
      include: { project: true, assignee: true },
    });
    const relations: string[] = [];
    if (task.project.notionPageId) relations.push(task.project.notionPageId);
    const properties: Record<string, unknown> = {
      Título: mapper.titleProperty(task.title),
      'Notas/Bloqueos': mapper.richTextProperty(task.description),
      Estado: mapper.statusProperty(mapper.taskStatusToNotion(task.status)),
      Prioridad: mapper.selectProperty(
        mapper.taskPriorityToNotion(task.priority),
      ),
      'Fecha límite': mapper.dateProperty(task.dueDate),
      Proyecto: mapper.relationProperty(
        task.project.notionPageId ? [task.project.notionPageId] : [],
      ),
      Responsable: mapper.relationProperty(
        task.assignee?.notionPageId ? [task.assignee.notionPageId] : [],
      ),
      pg_id: mapper.richTextProperty(task.id),
      sync_status: mapper.selectProperty(
        mapper.syncStatusToNotion(SyncStatus.SYNCED),
      ),
      synced_at: mapper.dateProperty(new Date()),
    };
    void relations;
    const dbId = this.config.get('NOTION_DB_TASKS', { infer: true });
    const page = task.notionPageId
      ? await this.notion.updatePage(task.notionPageId, properties)
      : await this.notion.createPage({
          parentDatabaseId: dbId,
          properties,
        });
    await this.prisma.task.update({
      where: { id },
      data: {
        notionPageId: page.id,
        syncedAt: new Date(),
        lastEditedTime: new Date(
          'last_edited_time' in page &&
            typeof page.last_edited_time === 'string'
            ? page.last_edited_time
            : Date.now(),
        ),
        syncStatus: SyncStatus.SYNCED,
      },
    });
  }

  private async pushProgress(id: string): Promise<void> {
    const entry = await this.prisma.progress.findUniqueOrThrow({
      where: { id },
      include: { project: true, task: true, author: true },
    });
    const evidence = entry.evidenceLinks[0] ?? null;
    const properties = {
      Título: mapper.titleProperty(entry.title),
      Descripción: mapper.richTextProperty(entry.description),
      Fecha: mapper.dateProperty(entry.recordedAt),
      'Evidencia (URL firmada)': mapper.urlProperty(evidence),
      Proyecto: mapper.relationProperty(
        entry.project.notionPageId ? [entry.project.notionPageId] : [],
      ),
      Tarea: mapper.relationProperty(
        entry.task?.notionPageId ? [entry.task.notionPageId] : [],
      ),
      Autor: mapper.relationProperty(
        entry.author.notionPageId ? [entry.author.notionPageId] : [],
      ),
      pg_id: mapper.richTextProperty(entry.id),
      sync_status: mapper.selectProperty(
        mapper.syncStatusToNotion(SyncStatus.SYNCED),
      ),
      synced_at: mapper.dateProperty(new Date()),
    };
    const dbId = this.config.get('NOTION_DB_PROGRESS', { infer: true });
    const page = entry.notionPageId
      ? await this.notion.updatePage(entry.notionPageId, properties)
      : await this.notion.createPage({
          parentDatabaseId: dbId,
          properties,
        });
    await this.prisma.progress.update({
      where: { id },
      data: {
        notionPageId: page.id,
        syncedAt: new Date(),
        lastEditedTime: new Date(
          'last_edited_time' in page &&
            typeof page.last_edited_time === 'string'
            ? page.last_edited_time
            : Date.now(),
        ),
        syncStatus: SyncStatus.SYNCED,
      },
    });
  }

  private async writePgId(pageId: string, pgId: string): Promise<void> {
    try {
      await this.notion.updatePage(pageId, {
        pg_id: mapper.richTextProperty(pgId),
        sync_status: mapper.selectProperty('synced'),
        synced_at: mapper.dateProperty(new Date()),
      });
    } catch (error) {
      this.logger.warn(
        `Could not write pg_id back to Notion page ${pageId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }
}
