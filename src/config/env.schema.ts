import { z } from 'zod';

const uuidLike = z.string().min(1);

const boolFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .default(false)
  .transform((value) => value === true || value === 'true' || value === '1');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    /**
     * Deploy environment (independent of NODE_ENV).
     * Railway staging/prod both use NODE_ENV=production; APP_ENV separates policy.
     */
    APP_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().min(1).default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_TTL: z.string().min(1).default('7d'),
    /** Access-token issuer claim (`iss`). */
    JWT_ISSUER: z.string().min(1).default('quantia-api'),
    /** Access-token audience claim (`aud`). */
    JWT_AUDIENCE: z.string().min(1).default('quantia-clients'),

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
     * Forbidden when APP_ENV=production.
     */
    CORS_VERCEL_PREVIEW: boolFromEnv,

    NOTION_TOKEN: z.string().min(1),
    NOTION_WEBHOOK_SECRET: z.string().min(1),
    NOTION_VERSION: z.string().min(1).default('2025-09-03'),
    NOTION_RATE_LIMIT_RPS: z.coerce.number().positive().default(3),
    NOTION_SYNC_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    /** Max |now - webhook timestamp| in seconds (replay / skew window). */
    NOTION_WEBHOOK_MAX_SKEW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(300),

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
    SUPABASE_STORAGE_BUCKET_REPORTS: z
      .string()
      .min(1)
      .default('quantia-reports'),
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

    /** S5 throttling (ttl milliseconds, limit requests). */
    THROTTLE_DEFAULT_TTL_MS: z.coerce.number().int().positive().default(60_000),
    THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().positive().default(120),
    THROTTLE_AUTH_TTL_MS: z.coerce.number().int().positive().default(60_000),
    THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(10),
    THROTTLE_REPORTS_TTL_MS: z.coerce.number().int().positive().default(60_000),
    THROTTLE_REPORTS_LIMIT: z.coerce.number().int().positive().default(5),

    HTTP_JSON_BODY_LIMIT: z.string().min(1).default('1mb'),
    HTTP_JSON_MAX_DEPTH: z.coerce.number().int().positive().default(10),

    WS_MAX_CONNECTIONS_PER_USER: z.coerce.number().int().positive().default(5),
    WS_MAX_EVENTS_PER_SECOND: z.coerce.number().int().positive().default(30),
    WS_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

    SECURITY_ALERT_401_403_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(50),

    /** ENG-171 — Chat General del semillero. */
    CHAT_GENERAL_ENABLED: boolFromEnv,
    CHAT_GENERAL_ROOM: z.string().min(1).default('general'),
    CHAT_GENERAL_HISTORY_DEFAULT_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    CHAT_GENERAL_HISTORY_MAX_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(100),
    CHAT_GENERAL_MESSAGE_MAX_LENGTH: z.coerce
      .number()
      .int()
      .positive()
      .max(4000)
      .default(2000),
    CHAT_GENERAL_PRESENCE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    CHAT_GENERAL_HEARTBEAT_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    /** Max POST /chat/general/messages per user per minute. */
    CHAT_GENERAL_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  })
  .superRefine((data, ctx) => {
    if (data.APP_ENV === 'production' && data.CORS_VERCEL_PREVIEW) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_VERCEL_PREVIEW'],
        message: 'CORS_VERCEL_PREVIEW must be false when APP_ENV=production',
      });
    }
    if (
      data.CHAT_GENERAL_HEARTBEAT_SECONDS >=
      data.CHAT_GENERAL_PRESENCE_TTL_SECONDS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CHAT_GENERAL_HEARTBEAT_SECONDS'],
        message:
          'CHAT_GENERAL_HEARTBEAT_SECONDS must be less than CHAT_GENERAL_PRESENCE_TTL_SECONDS',
      });
    }
    if (
      data.CHAT_GENERAL_HISTORY_DEFAULT_LIMIT >
      data.CHAT_GENERAL_HISTORY_MAX_LIMIT
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CHAT_GENERAL_HISTORY_DEFAULT_LIMIT'],
        message:
          'CHAT_GENERAL_HISTORY_DEFAULT_LIMIT must be <= CHAT_GENERAL_HISTORY_MAX_LIMIT',
      });
    }
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
