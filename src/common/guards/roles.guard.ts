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
import {
  isAuditedMutationPath,
  resolveAuditResource,
  resolveAuditResourceId,
} from '../../audit/audit-paths';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      await this.auditRoleDenial(request);
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }

  /**
   * Guards run before interceptors, so role denials never reach AuditInterceptor.
   * Mirror DENIED logging here for the same audited mutation paths.
   */
  private async auditRoleDenial(
    request: Request & { user?: AuthenticatedUser },
  ): Promise<void> {
    const method = (request.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return;
    }

    const url = request.url ?? '';
    const route = request.route as { path?: unknown } | undefined;
    const routePath = typeof route?.path === 'string' ? route.path : '';
    if (!isAuditedMutationPath(url, routePath)) {
      return;
    }

    await this.audit.log({
      actorId: request.user?.id ?? null,
      action: `${method} ${routePath || request.path || url}`,
      resource: resolveAuditResource(url, routePath),
      resourceId: resolveAuditResourceId(request.params ?? {}),
      result: AuditResult.DENIED,
      ip: request.ip ?? null,
      userAgent: request.get?.('user-agent') ?? null,
      metadata: { message: 'Insufficient role' },
    });
  }
}
