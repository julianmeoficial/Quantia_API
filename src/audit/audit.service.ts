import { Injectable } from '@nestjs/common';
import { AuditResult, type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type CreateAuditLogInput = {
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  result: AuditResult;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: CreateAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        result: input.result,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }
}
