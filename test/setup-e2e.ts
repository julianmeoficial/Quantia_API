process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3000';
process.env.DATABASE_URL ??=
  'postgresql://quantia:quantia@localhost:5433/quantia';
process.env.DIRECT_URL ??=
  'postgresql://quantia:quantia@localhost:5433/quantia';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'quantia-test-access-secret-change-me-32';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.JWT_REFRESH_SECRET ??= 'quantia-test-refresh-secret-change-me-32';
process.env.JWT_REFRESH_TTL ??= '7d';
