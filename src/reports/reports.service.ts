import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ReportStatus, type Report } from '@prisma/client';
import { Queue } from 'bullmq';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { ProjectAccessService } from '../common/project-access.service';
import type { EnvConfig } from '../config/env.schema';
import { StorageService } from '../storage/storage.service';
import {
  REPORT_JOB,
  REPORTS_QUEUE,
  type GenerateReportJobData,
} from './reports.constants';
import { ReportsRepository } from './reports.repository';
import {
  CreateReportDto,
  ReportAcceptedResponseDto,
  ReportResponseDto,
} from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly reportsRepository: ReportsRepository,
    private readonly projectAccess: ProjectAccessService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
    @InjectQueue(REPORTS_QUEUE) private readonly reportsQueue: Queue,
  ) {}

  async create(
    user: AuthenticatedUser,
    projectId: string,
    dto: CreateReportDto,
  ): Promise<ReportAcceptedResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);

    const report = await this.reportsRepository.create({
      projectId,
      requestedById: user.id,
      kind: dto.kind,
    });

    const job = await this.reportsQueue.add(
      REPORT_JOB.GENERATE,
      { reportId: report.id } satisfies GenerateReportJobData,
      {
        jobId: report.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    await this.reportsRepository.update(report.id, {
      jobId: String(job.id ?? report.id),
    });

    return {
      reportId: report.id,
      status: ReportStatus.QUEUED,
    };
  }

  async getStatus(
    user: AuthenticatedUser,
    projectId: string,
    reportId: string,
  ): Promise<ReportResponseDto> {
    await this.projectAccess.assertCanAccessProject(user, projectId);
    const report = await this.reportsRepository.findById(reportId);
    if (!report || report.projectId !== projectId) {
      throw new NotFoundException('Report not found');
    }
    return this.toResponse(report);
  }

  async toResponse(report: Report): Promise<ReportResponseDto> {
    let downloadUrl: string | null = null;
    let expiresInSeconds: number | null = null;

    if (
      report.status === ReportStatus.READY &&
      report.storageBucket &&
      report.storageKey
    ) {
      const ttl = this.config.get('STORAGE_SIGNED_URL_TTL_SECONDS', {
        infer: true,
      });
      expiresInSeconds = ttl;
      downloadUrl = await this.storage.createSignedUrl(
        report.storageBucket,
        report.storageKey,
        ttl,
      );
    }

    return {
      id: report.id,
      projectId: report.projectId,
      requestedById: report.requestedById,
      kind: report.kind,
      status: report.status,
      errorMessage:
        report.status === ReportStatus.FAILED
          ? 'Report generation failed'
          : null,
      downloadUrl,
      expiresInSeconds,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}
