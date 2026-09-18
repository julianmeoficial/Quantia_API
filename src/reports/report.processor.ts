import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportKind, ReportStatus } from '@prisma/client';
import { Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../database/prisma.service';
import type { EnvConfig } from '../config/env.schema';
import { StorageService } from '../storage/storage.service';
import {
  REPORT_JOB,
  REPORTS_QUEUE,
  type GenerateReportJobData,
} from './reports.constants';
import { ReportsRepository } from './reports.repository';

@Processor(REPORTS_QUEUE)
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(
    private readonly reportsRepository: ReportsRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    super();
  }

  async process(job: Job<GenerateReportJobData>): Promise<void> {
    if (job.name !== REPORT_JOB.GENERATE) {
      this.logger.warn(`Unknown report job: ${job.name}`);
      return;
    }

    const { reportId } = job.data;
    const report = await this.reportsRepository.findById(reportId);
    if (!report) {
      this.logger.warn(`Report ${reportId} not found`);
      return;
    }

    await this.reportsRepository.update(reportId, {
      status: ReportStatus.PROCESSING,
    });

    try {
      const { buffer, mime, extension } = await this.generate(
        report.kind,
        report.projectId,
      );
      const bucket = this.config.get('SUPABASE_STORAGE_BUCKET_REPORTS', {
        infer: true,
      });
      const storageKey = `${report.projectId}/${reportId}.${extension}`;

      await this.storage.uploadObject(bucket, storageKey, buffer, mime);

      await this.reportsRepository.update(reportId, {
        status: ReportStatus.READY,
        storageBucket: bucket,
        storageKey,
        errorMessage: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Report generation failed';
      this.logger.error(`Report ${reportId} failed: ${message}`);
      await this.reportsRepository.update(reportId, {
        status: ReportStatus.FAILED,
        errorMessage: message,
      });
      throw error;
    }
  }

  private async generate(
    kind: ReportKind,
    projectId: string,
  ): Promise<{ buffer: Buffer; mime: string; extension: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        budget: {
          include: {
            items: true,
            executions: { orderBy: { occurredAt: 'asc' } },
          },
        },
        progress: { orderBy: { recordedAt: 'asc' }, take: 50 },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    if (kind === ReportKind.BUDGET_EXCEL) {
      const buffer = await this.buildBudgetExcel(project);
      return {
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
      };
    }

    const buffer =
      kind === ReportKind.PROGRESS_PDF
        ? await this.buildProgressPdf(project)
        : await this.buildBudgetPdf(project);

    return {
      buffer,
      mime: 'application/pdf',
      extension: 'pdf',
    };
  }

  private async buildBudgetPdf(project: {
    title: string;
    budget: {
      totalAmount: { toString(): string };
      currency: string;
      items: Array<{ category: string; plannedAmount: { toString(): string } }>;
      executions: Array<{
        kind: string;
        amount: { toString(): string };
        occurredAt: Date;
      }>;
    } | null;
  }): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(18).text(`Budget report — ${project.title}`);
    doc.moveDown();

    if (!project.budget) {
      doc.fontSize(12).text('No budget configured for this project.');
    } else {
      doc
        .fontSize(12)
        .text(
          `Total: ${project.budget.totalAmount.toString()} ${project.budget.currency}`,
        );
      doc.moveDown();
      doc.text('Items:');
      for (const item of project.budget.items) {
        doc.text(`• ${item.category}: ${item.plannedAmount.toString()}`);
      }
      doc.moveDown();
      doc.text('Executions:');
      for (const exec of project.budget.executions) {
        doc.text(
          `• ${exec.occurredAt.toISOString().slice(0, 10)} ${exec.kind} ${exec.amount.toString()}`,
        );
      }
    }

    doc.end();
    return done;
  }

  private async buildProgressPdf(project: {
    title: string;
    progress: Array<{
      title: string;
      description: string;
      recordedAt: Date;
    }>;
  }): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(18).text(`Progress report — ${project.title}`);
    doc.moveDown();

    if (project.progress.length === 0) {
      doc.fontSize(12).text('No progress entries.');
    } else {
      for (const entry of project.progress) {
        doc
          .fontSize(12)
          .text(
            `• ${entry.recordedAt.toISOString().slice(0, 10)} — ${entry.title}`,
          );
        if (entry.description) {
          doc.fontSize(10).text(`  ${entry.description}`);
        }
      }
    }

    doc.end();
    return done;
  }

  private async buildBudgetExcel(project: {
    title: string;
    budget: {
      totalAmount: { toString(): string };
      currency: string;
      items: Array<{ category: string; plannedAmount: { toString(): string } }>;
      executions: Array<{
        kind: string;
        amount: { toString(): string };
        occurredAt: Date;
      }>;
    } | null;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Budget');
    sheet.addRow(['Project', project.title]);
    sheet.addRow([
      'Total',
      project.budget?.totalAmount.toString() ?? '0',
      project.budget?.currency ?? '',
    ]);
    sheet.addRow([]);
    sheet.addRow(['Category', 'Planned amount']);
    for (const item of project.budget?.items ?? []) {
      sheet.addRow([item.category, item.plannedAmount.toString()]);
    }
    sheet.addRow([]);
    sheet.addRow(['Date', 'Kind', 'Amount']);
    for (const exec of project.budget?.executions ?? []) {
      sheet.addRow([
        exec.occurredAt.toISOString(),
        exec.kind,
        exec.amount.toString(),
      ]);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
