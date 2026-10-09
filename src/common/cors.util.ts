import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { CORS_EXPOSED_HEADERS } from '@quantia/contracts';

/**
 * Anchored Vercel preview hosts only: https://<subdomain>.vercel.app
 * Rejects evil.com, vercel.app without subdomain, and http.
 */
export const VERCEL_PREVIEW_ORIGIN_RE =
  /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?\.vercel\.app$/i;

export function parseCorsOrigins(csv: string): string[] {
  return csv
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowlist: string[],
  allowVercelPreview: boolean,
): boolean {
  // Non-browser clients (curl, server-to-server, same-origin) omit Origin.
  if (!origin) {
    return true;
  }
  if (allowlist.includes(origin)) {
    return true;
  }
  if (allowVercelPreview && VERCEL_PREVIEW_ORIGIN_RE.test(origin)) {
    return true;
  }
  return false;
}

export type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

export function createHttpCorsOptions(
  allowlist: string[],
  allowVercelPreview: boolean,
): CorsOptions {
  return {
    origin: createCorsOriginDelegate(allowlist, allowVercelPreview),
    credentials: true,
    exposedHeaders: [...CORS_EXPOSED_HEADERS],
  };
}

export function createCorsOriginDelegate(
  allowlist: string[],
  allowVercelPreview: boolean,
): (origin: string | undefined, callback: CorsOriginCallback) => void {
  return (origin, callback) => {
    callback(null, isAllowedCorsOrigin(origin, allowlist, allowVercelPreview));
  };
}
