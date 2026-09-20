import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditResult } from '@prisma/client';
import { RoleName } from '@quantia/contracts';
import { Request } from 'express';
import { AuditService } from '../../audit/audit.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

const AUDITED_PATH_RE = /\/budget|\/documents|\/reports/;

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Insufficient role');
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      this.auditRoleDenial(request);
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }

  /**
   * Guards run before interceptors, so role denials never reach AuditInterceptor.
   * Mirror DENIED logging here for the same audited mutation paths.
   */
  private auditRoleDenial(
    request: Request & { user?: AuthenticatedUser },
  ): void {
    const method = (request.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return;
    }

    const url = request.url ?? '';
    const route = request.route as { path?: unknown } | undefined;
    const routePath = typeof route?.path === 'string' ? route.path : '';
    if (!AUDITED_PATH_RE.test(url) && !AUDITED_PATH_RE.test(routePath)) {
      return;
    }

    const haystack = `${url} ${routePath}`;
    let resource = 'unknown';
    if (haystack.includes('/budget')) resource = 'budget';
    else if (haystack.includes('/documents')) resource = 'documents';
    else if (haystack.includes('/reports')) resource = 'reports';

    const params = request.params ?? {};
    const raw =
      params.id ??
      params.documentId ??
      params.reportId ??
      params.executionId ??
      params.projectId ??
      null;
    const resourceId = Array.isArray(raw) ? (raw[0] ?? null) : raw;

    void this.audit.log({
      actorId: request.user?.id ?? null,
      action: `${method} ${routePath || request.path || url}`,
      resource,
      resourceId,
      result: AuditResult.DENIED,
      ip: request.ip ?? null,
      userAgent: request.get?.('user-agent') ?? null,
      metadata: { message: 'Insufficient role' },
    });
  }
}
