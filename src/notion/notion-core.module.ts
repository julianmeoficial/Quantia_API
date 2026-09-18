import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NOTION_SYNC_QUEUE } from '../queues/notion-sync.constants';
import { NotionClient } from './notion.client';
import { NotionSyncEnqueueService } from './notion-sync-enqueue.service';
import { NotionSyncService } from './notion-sync.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTION_SYNC_QUEUE,
    }),
  ],
  providers: [NotionClient, NotionSyncService, NotionSyncEnqueueService],
  exports: [NotionClient, NotionSyncService, NotionSyncEnqueueService],
})
export class NotionCoreModule {}
