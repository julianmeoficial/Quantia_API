import { EnvConfig } from './env.schema';

export default (): EnvConfig => ({
  NODE_ENV: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
  PORT: Number(process.env.PORT),
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  DIRECT_URL: process.env.DIRECT_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? '',
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? '',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? '7d',

  NOTION_TOKEN: process.env.NOTION_TOKEN ?? '',
  NOTION_WEBHOOK_SECRET: process.env.NOTION_WEBHOOK_SECRET ?? '',
  NOTION_VERSION: process.env.NOTION_VERSION ?? '2025-09-03',
  NOTION_RATE_LIMIT_RPS: Number(process.env.NOTION_RATE_LIMIT_RPS ?? 3),
  NOTION_SYNC_MAX_ATTEMPTS: Number(process.env.NOTION_SYNC_MAX_ATTEMPTS ?? 5),

  NOTION_SANDBOX_PAGE_ID: process.env.NOTION_SANDBOX_PAGE_ID ?? '',
  NOTION_DB_USERS: process.env.NOTION_DB_USERS ?? '',
  NOTION_DS_USERS: process.env.NOTION_DS_USERS ?? '',
  NOTION_DB_PROJECTS: process.env.NOTION_DB_PROJECTS ?? '',
  NOTION_DS_PROJECTS: process.env.NOTION_DS_PROJECTS ?? '',
  NOTION_DB_TASKS: process.env.NOTION_DB_TASKS ?? '',
  NOTION_DS_TASKS: process.env.NOTION_DS_TASKS ?? '',
  NOTION_DB_PROGRESS: process.env.NOTION_DB_PROGRESS ?? '',
  NOTION_DS_PROGRESS: process.env.NOTION_DS_PROGRESS ?? '',
  NOTION_DB_SYNC_LOG: process.env.NOTION_DB_SYNC_LOG ?? '',
  NOTION_DS_SYNC_LOG: process.env.NOTION_DS_SYNC_LOG ?? '',
});
