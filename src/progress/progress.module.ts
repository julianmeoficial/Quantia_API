import { Module } from '@nestjs/common';
import { NotionModule } from '../notion/notion.module';
import { ProgressController } from './progress.controller';
import { ProgressRepository } from './progress.repository';
import { ProgressService } from './progress.service';

@Module({
  imports: [NotionModule],
  controllers: [ProgressController],
  providers: [ProgressService, ProgressRepository],
  exports: [ProgressService],
})
export class ProgressModule {}
