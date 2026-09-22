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

const REDACT_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'verification_token',
  'secret',
]);

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
        metadata: this.sanitizeMetadata(input.metadata) ?? undefined,
      },
    });
  }

  /** Strip secrets from metadata before persistence (S5). */
  sanitizeMetadata(
    metadata: Prisma.InputJsonValue | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (metadata === undefined || metadata === null) {
      return metadata;
    }
    return this.sanitizeValue(metadata) as Prisma.InputJsonValue;
  }

  private sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (
          REDACT_KEYS.has(key) ||
          /password|token|secret|authorization/i.test(key)
        ) {
          out[key] = '[Redacted]';
        } else {
          out[key] = this.sanitizeValue(nested);
        }
      }
      return out;
    }
    return value;
  }
}
