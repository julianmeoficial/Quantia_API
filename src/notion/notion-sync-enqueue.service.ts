import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  SyncDirection,
  SyncEntityType,
  SyncEventStatus,
  SyncJobName,
  SyncStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { EnvConfig } from '../config/env.schema';
import { NOTION_JOB, NOTION_SYNC_QUEUE } from '../queues/notion-sync.constants';

@Injectable()
export class NotionSyncEnqueueService {
  private readonly logger = new Logger(NotionSyncEnqueueService.name);
  private readonly maxAttempts: number;

  constructor(
    @InjectQueue(NOTION_SYNC_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.maxAttempts = config.get('NOTION_SYNC_MAX_ATTEMPTS', { infer: true });
  }

  async enqueueDbToNotion(
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<void> {
    await this.markEntityPending(entityType, entityId);

    const event = await this.prisma.syncEvent.create({
      data: {
        direction: SyncDirection.DB_TO_NOTION,
        entityType,
        jobName: SyncJobName.DB_TO_NOTION,
        entityId,
        status: SyncEventStatus.QUEUED,
      },
    });

    await this.queue.add(
      NOTION_JOB.DB_TO_NOTION,
      { entityType, entityId, syncEventId: event.id },
      {
        attempts: this.maxAttempts,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
  }

  async enqueueNotionToDb(params: {
    notionPageId: string;
    entityType?: SyncEntityType;
    lastEditedTime?: string;
  }): Promise<void> {
    const event = await this.prisma.syncEvent.create({
      data: {
        direction: SyncDirection.NOTION_TO_DB,
        entityType: params.entityType ?? SyncEntityType.PROJECT,
        jobName: SyncJobName.NOTION_TO_DB,
        notionPageId: params.notionPageId,
        status: SyncEventStatus.QUEUED,
        payloadLastEditedTime: params.lastEditedTime
          ? new Date(params.lastEditedTime)
          : undefined,
      },
    });

    await this.queue.add(
      NOTION_JOB.NOTION_TO_DB,
      {
        notionPageId: params.notionPageId,
        entityType: params.entityType,
        lastEditedTime: params.lastEditedTime,
        syncEventId: event.id,
      },
      {
        attempts: this.maxAttempts,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    this.logger.debug(`Enqueued notion-to-db for ${params.notionPageId}`);
  }

  private async markEntityPending(
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<void> {
    const data = { syncStatus: SyncStatus.PENDING };
    switch (entityType) {
      case SyncEntityType.USER:
        await this.prisma.user.update({ where: { id: entityId }, data });
        break;
      case SyncEntityType.PROJECT:
        await this.prisma.project.update({ where: { id: entityId }, data });
        break;
      case SyncEntityType.TASK:
        await this.prisma.task.update({ where: { id: entityId }, data });
        break;
      case SyncEntityType.PROGRESS:
        await this.prisma.progress.update({ where: { id: entityId }, data });
        break;
    }
  }
}
