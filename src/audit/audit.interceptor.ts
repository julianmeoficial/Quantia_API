import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { Request } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { AuditService } from './audit.service';
import {
  isAuditedMutationPath,
  resolveAuditResource,
  resolveAuditResourceId,
} from './audit-paths';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();

    if (!this.shouldAudit(request)) {
      return next.handle();
    }

    const action = `${request.method} ${this.pathForAction(request)}`;
    const routePath = this.routePath(request) ?? '';
    const resource = resolveAuditResource(request.url ?? '', routePath);
    const resourceId = resolveAuditResourceId(request.params ?? {});
    const actorId = request.user?.id ?? null;
    const ip = request.ip ?? null;
    const userAgent = request.get('user-agent') ?? null;

    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          actorId,
          action,
          resource,
          resourceId,
          result: AuditResult.SUCCESS,
          ip,
          userAgent,
        });
      }),
      catchError((error: unknown) => {
        const result =
          error instanceof ForbiddenException
            ? AuditResult.DENIED
            : AuditResult.ERROR;

        void this.audit.log({
          actorId,
          action,
          resource,
          resourceId,
          result,
          ip,
          userAgent,
          metadata:
            error instanceof Error
              ? { message: error.message }
              : { message: 'unknown error' },
        });

        return throwError(() => error);
      }),
    );
  }

  private shouldAudit(request: Request): boolean {
    const method = (request.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return false;
    }
    const url = request.url ?? '';
    const routePath = this.routePath(request) ?? '';
    return isAuditedMutationPath(url, routePath);
  }

  private pathForAction(request: Request): string {
    return this.routePath(request) ?? request.path ?? request.url ?? '';
  }

  private routePath(request: Request): string | null {
    const route = request.route as { path?: unknown } | undefined;
    return typeof route?.path === 'string' ? route.path : null;
  }
}
