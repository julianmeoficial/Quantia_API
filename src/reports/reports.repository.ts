import { Injectable } from '@nestjs/common';
import { ReportStatus, type Prisma, type Report } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    projectId: string;
    requestedById: string;
    kind: Report['kind'];
  }): Promise<Report> {
    return this.prisma.report.create({
      data: {
        projectId: data.projectId,
        requestedById: data.requestedById,
        kind: data.kind,
        status: ReportStatus.QUEUED,
      },
    });
  }

  findById(id: string): Promise<Report | null> {
    return this.prisma.report.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.ReportUpdateInput): Promise<Report> {
    return this.prisma.report.update({ where: { id }, data });
  }
}
