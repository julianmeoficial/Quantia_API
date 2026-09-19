import { z } from 'zod';

const uuidLike = z.string().min(1);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_TTL: z.string().min(1).default('7d'),

  /** Comma-separated CORS allowlist for HTTP + Socket.io (never `*`). */
  CORS_ORIGINS: z
    .string()
    .min(1)
    .refine(
      (value) =>
        !value
          .split(',')
          .map((o) => o.trim())
          .includes('*'),
      {
        message: 'CORS_ORIGINS must not include *',
      },
    ),

  /**
   * When true, also allow `https://*.vercel.app` (anchored subdomain only).
   * Set on staging so Vercel preview deploys can call the API.
   */
  CORS_VERCEL_PREVIEW: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .default(false)
    .transform((value) => value === true || value === 'true' || value === '1'),

  NOTION_TOKEN: z.string().min(1),
  NOTION_WEBHOOK_SECRET: z.string().min(1),
  NOTION_VERSION: z.string().min(1).default('2025-09-03'),
  NOTION_RATE_LIMIT_RPS: z.coerce.number().positive().default(3),
  NOTION_SYNC_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  NOTION_SANDBOX_PAGE_ID: uuidLike,
  NOTION_DB_USERS: uuidLike,
  NOTION_DS_USERS: uuidLike,
  NOTION_DB_PROJECTS: uuidLike,
  NOTION_DS_PROJECTS: uuidLike,
  NOTION_DB_TASKS: uuidLike,
  NOTION_DS_TASKS: uuidLike,
  NOTION_DB_PROGRESS: uuidLike,
  NOTION_DS_PROGRESS: uuidLike,
  NOTION_DB_SYNC_LOG: uuidLike,
  NOTION_DS_SYNC_LOG: uuidLike,

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET_DOCUMENTS: z
    .string()
    .min(1)
    .default('quantia-documents'),
  SUPABASE_STORAGE_BUCKET_REPORTS: z.string().min(1).default('quantia-reports'),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(300),
  STORAGE_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(26214400),
  STORAGE_ALLOWED_MIME: z
    .string()
    .min(1)
    .default(
      'application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${details}`);
  }
  return result.data;
}
