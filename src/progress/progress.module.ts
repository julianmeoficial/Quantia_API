import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressRepository } from './progress.repository';
import { ProgressService } from './progress.service';

@Module({
  controllers: [ProgressController],
  providers: [ProgressService, ProgressRepository],
  exports: [ProgressService],
})
export class ProgressModule {}
