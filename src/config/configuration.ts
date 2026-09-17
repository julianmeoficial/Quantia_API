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
});
