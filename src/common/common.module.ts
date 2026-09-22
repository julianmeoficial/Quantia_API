import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { SecurityMetricsService } from './security-metrics.service';

@Global()
@Module({
  providers: [ProjectAccessService, SecurityMetricsService],
  exports: [ProjectAccessService, SecurityMetricsService],
})
export class CommonModule {}
