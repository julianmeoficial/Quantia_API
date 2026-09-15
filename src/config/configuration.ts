import { EnvConfig } from './env.schema';

export default (): EnvConfig => ({
  NODE_ENV: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
  PORT: Number(process.env.PORT),
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  DIRECT_URL: process.env.DIRECT_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? '',
});
