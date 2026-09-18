import { Module } from '@nestjs/common';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { BudgetController } from './budget.controller';
import { BudgetRepository } from './budget.repository';
import { BudgetService } from './budget.service';

@Module({
  imports: [RealtimeCoreModule],
  controllers: [BudgetController],
  providers: [BudgetService, BudgetRepository],
  exports: [BudgetService, BudgetRepository],
})
export class BudgetModule {}
