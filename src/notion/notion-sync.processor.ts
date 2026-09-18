import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { SyncDbToNotionJob, SyncNotionToDbJob } from '@quantia/contracts';
import { NOTION_JOB, NOTION_SYNC_QUEUE } from '../queues/notion-sync.constants';
import { NotionSyncService } from './notion-sync.service';

@Processor(NOTION_SYNC_QUEUE)
export class NotionSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(NotionSyncProcessor.name);

  constructor(private readonly syncService: NotionSyncService) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      if (job.name === NOTION_JOB.NOTION_TO_DB) {
        const data = job.data as SyncNotionToDbJob;
        await this.syncService.syncNotionPageToDb({
          notionPageId: data.notionPageId,
          entityType: data.entityType,
          lastEditedTime: data.lastEditedTime,
          syncEventId: data.syncEventId,
          attempt: job.attemptsMade + 1,
        });
        return;
      }

      if (job.name === NOTION_JOB.DB_TO_NOTION) {
        const data = job.data as SyncDbToNotionJob;
        await this.syncService.syncEntityToNotion({
          entityType: data.entityType,
          entityId: data.entityId,
          syncEventId: data.syncEventId,
          attempt: job.attemptsMade + 1,
        });
        return;
      }

      this.logger.warn(`Unknown job name: ${job.name}`);
    } catch (error) {
      const syncEventId =
        typeof job.data === 'object' &&
        job.data !== null &&
        'syncEventId' in job.data
          ? (job.data as { syncEventId?: string }).syncEventId
          : undefined;
      const maxAttempts = job.opts.attempts ?? 5;
      if (job.attemptsMade + 1 >= maxAttempts) {
        await this.syncService.markFailed(syncEventId, error);
      }
      throw error;
    }
  }
}
