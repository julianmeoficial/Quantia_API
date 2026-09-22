/**
 * Shared path matching for AuditInterceptor and RolesGuard DENIED logging (S5).
 */
export const AUDITED_PATH_RE =
  /\/auth|\/users|\/projects|\/tasks|\/progress|\/budget|\/documents|\/reports|\/webhooks\/notion/;

export function isAuditedMutationPath(url: string, routePath: string): boolean {
  return AUDITED_PATH_RE.test(url) || AUDITED_PATH_RE.test(routePath);
}

export function resolveAuditResource(url: string, routePath: string): string {
  const haystack = `${url} ${routePath}`;
  if (haystack.includes('/webhooks/notion')) return 'webhook';
  if (haystack.includes('/budget')) return 'budget';
  if (haystack.includes('/documents')) return 'documents';
  if (haystack.includes('/reports')) return 'reports';
  if (haystack.includes('/progress')) return 'progress';
  if (haystack.includes('/tasks')) return 'tasks';
  if (haystack.includes('/projects')) return 'projects';
  if (haystack.includes('/users')) return 'users';
  if (haystack.includes('/auth')) return 'auth';
  return 'unknown';
}

export function resolveAuditResourceId(
  params: Record<string, string | string[] | undefined>,
): string | null {
  const raw =
    params.id ??
    params.documentId ??
    params.reportId ??
    params.executionId ??
    params.taskId ??
    params.progressId ??
    params.projectId ??
    params.userId ??
    null;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw ?? null;
}
