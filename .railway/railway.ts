/**
 * Railway Infrastructure as Code — ENG-158 (replaces deprecated railway.toml).
 * Hard cutoff for Config as Code: 2026-12-01.
 *
 * Imported via `railway config pull` from staging project `Quantia_API`.
 * Secrets stay as `preserve()` — never commit decrypted values.
 *
 * Layout:
 * - Quantia_API — GitHub main, start `node dist/main.js`, health `/api/v1/health`
 * - worker — start `node dist/worker.js` (no HTTP healthcheck)
 * - migrate — `npx prisma migrate deploy` (DIRECT_URL = Session pooler, ENG-156)
 * - Redis — managed plugin + volume
 * - api — legacy (deprecate separately; kept here so apply does not delete it)
 *
 * Workflow: `npx railway config plan` → review → `npx railway config apply`
 * Never pass `--confirm-destructive` unless intentionally destroying resources.
 */
import {
  defineRailway,
  github,
  preserve,
  project,
  redis,
  service,
  volume,
} from 'railway/iac';

export default defineRailway(() => {
  const Redis = redis('Redis', { region: 'sfo' });
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  Redis.networking = { privateNetworkEndpoint: 'redis' };
  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'sfo',
    sizeMB: 500,
  });

  const Quantia_API = service('Quantia_API', {
    source: github('julianmeoficial/Quantia_API', {
      branch: 'main',
      checkSuites: false,
    }),
    start: 'node dist/main.js',
    healthcheck: '/api/v1/health',
    healthcheckTimeout: 30,
    replicas: { sfo: 1 },
    networking: { privateNetworkEndpoint: 'quantiaapi' },
    env: {
      CORS_ORIGINS: preserve(),
      CORS_VERCEL_PREVIEW: preserve(),
      DATABASE_URL: preserve(),
      DIRECT_URL: preserve(),
      JWT_ACCESS_SECRET: preserve(),
      JWT_ACCESS_TTL: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      JWT_REFRESH_TTL: preserve(),
      NODE_ENV: preserve(),
      NODE_OPTIONS: preserve(),
      NOTION_DB_PROGRESS: preserve(),
      NOTION_DB_PROJECTS: preserve(),
      NOTION_DB_SYNC_LOG: preserve(),
      NOTION_DB_TASKS: preserve(),
      NOTION_DB_USERS: preserve(),
      NOTION_DS_PROGRESS: preserve(),
      NOTION_DS_PROJECTS: preserve(),
      NOTION_DS_SYNC_LOG: preserve(),
      NOTION_DS_TASKS: preserve(),
      NOTION_DS_USERS: preserve(),
      NOTION_RATE_LIMIT_RPS: preserve(),
      NOTION_SANDBOX_PAGE_ID: preserve(),
      NOTION_SYNC_MAX_ATTEMPTS: preserve(),
      NOTION_TOKEN: preserve(),
      NOTION_VERSION: preserve(),
      NOTION_WEBHOOK_SECRET: preserve(),
      RAILWAY_ENVIRONMENT: preserve(),
      RAILWAY_ENVIRONMENT_ID: preserve(),
      RAILWAY_ENVIRONMENT_NAME: preserve(),
      RAILWAY_PRIVATE_DOMAIN: preserve(),
      RAILWAY_PROJECT_ID: preserve(),
      RAILWAY_PROJECT_NAME: preserve(),
      RAILWAY_PUBLIC_DOMAIN: preserve(),
      RAILWAY_SERVICE_API_URL: preserve(),
      RAILWAY_SERVICE_ID: preserve(),
      RAILWAY_SERVICE_NAME: preserve(),
      RAILWAY_STATIC_URL: preserve(),
      REDIS_URL: preserve(),
      STORAGE_ALLOWED_MIME: preserve(),
      STORAGE_MAX_UPLOAD_BYTES: preserve(),
      STORAGE_SIGNED_URL_TTL_SECONDS: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_STORAGE_BUCKET_DOCUMENTS: preserve(),
      SUPABASE_STORAGE_BUCKET_REPORTS: preserve(),
      SUPABASE_URL: preserve(),
    },
  });

  const worker = service('worker', {
    start: 'node dist/worker.js',
    replicas: { sfo: 1 },
    env: {
      CORS_ORIGINS: preserve(),
      CORS_VERCEL_PREVIEW: preserve(),
      DATABASE_URL: preserve(),
      DIRECT_URL: preserve(),
      JWT_ACCESS_SECRET: preserve(),
      JWT_ACCESS_TTL: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      JWT_REFRESH_TTL: preserve(),
      NODE_ENV: preserve(),
      NODE_OPTIONS: preserve(),
      NOTION_DB_PROGRESS: preserve(),
      NOTION_DB_PROJECTS: preserve(),
      NOTION_DB_SYNC_LOG: preserve(),
      NOTION_DB_TASKS: preserve(),
      NOTION_DB_USERS: preserve(),
      NOTION_DS_PROGRESS: preserve(),
      NOTION_DS_PROJECTS: preserve(),
      NOTION_DS_SYNC_LOG: preserve(),
      NOTION_DS_TASKS: preserve(),
      NOTION_DS_USERS: preserve(),
      NOTION_RATE_LIMIT_RPS: preserve(),
      NOTION_SANDBOX_PAGE_ID: preserve(),
      NOTION_SYNC_MAX_ATTEMPTS: preserve(),
      NOTION_TOKEN: preserve(),
      NOTION_VERSION: preserve(),
      NOTION_WEBHOOK_SECRET: preserve(),
      REDIS_URL: preserve(),
      STORAGE_ALLOWED_MIME: preserve(),
      STORAGE_MAX_UPLOAD_BYTES: preserve(),
      STORAGE_SIGNED_URL_TTL_SECONDS: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_STORAGE_BUCKET_DOCUMENTS: preserve(),
      SUPABASE_STORAGE_BUCKET_REPORTS: preserve(),
      SUPABASE_URL: preserve(),
    },
  });

  const migrate = service('migrate', {
    start: 'npx prisma migrate deploy',
    replicas: { sfo: 1 },
    env: {
      DATABASE_URL: preserve(),
      DIRECT_URL: preserve(),
      NODE_ENV: preserve(),
      RAILWAY_DOCKERFILE_TARGET: preserve(),
      REDIS_URL: preserve(),
    },
  });

  // Legacy manual `railway up` service — keep declared so IaC apply does not delete it.
  const api = service('api', {
    start: 'node dist/main.js',
    healthcheck: '/api/v1/health',
    healthcheckTimeout: 120,
    replicas: { sfo: 1 },
    env: {
      CORS_ORIGINS: preserve(),
      CORS_VERCEL_PREVIEW: preserve(),
      DATABASE_URL: preserve(),
      DIRECT_URL: preserve(),
      JWT_ACCESS_SECRET: preserve(),
      JWT_ACCESS_TTL: preserve(),
      JWT_REFRESH_SECRET: preserve(),
      JWT_REFRESH_TTL: preserve(),
      NODE_ENV: preserve(),
      NODE_OPTIONS: preserve(),
      NOTION_DB_PROGRESS: preserve(),
      NOTION_DB_PROJECTS: preserve(),
      NOTION_DB_SYNC_LOG: preserve(),
      NOTION_DB_TASKS: preserve(),
      NOTION_DB_USERS: preserve(),
      NOTION_DS_PROGRESS: preserve(),
      NOTION_DS_PROJECTS: preserve(),
      NOTION_DS_SYNC_LOG: preserve(),
      NOTION_DS_TASKS: preserve(),
      NOTION_DS_USERS: preserve(),
      NOTION_RATE_LIMIT_RPS: preserve(),
      NOTION_SANDBOX_PAGE_ID: preserve(),
      NOTION_SYNC_MAX_ATTEMPTS: preserve(),
      NOTION_TOKEN: preserve(),
      NOTION_VERSION: preserve(),
      NOTION_WEBHOOK_SECRET: preserve(),
      REDIS_URL: preserve(),
      STORAGE_ALLOWED_MIME: preserve(),
      STORAGE_MAX_UPLOAD_BYTES: preserve(),
      STORAGE_SIGNED_URL_TTL_SECONDS: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_STORAGE_BUCKET_DOCUMENTS: preserve(),
      SUPABASE_STORAGE_BUCKET_REPORTS: preserve(),
      SUPABASE_URL: preserve(),
    },
  });

  return project('Quantia_API', {
    resources: [Redis, Quantia_API, worker, migrate, api, redisVolume],
  });
});
