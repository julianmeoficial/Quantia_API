process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3000';
process.env.DATABASE_URL ??=
  'postgresql://quantia:quantia@localhost:5433/quantia';
process.env.DIRECT_URL ??=
  'postgresql://quantia:quantia@localhost:5433/quantia';
process.env.REDIS_URL ??= 'redis://localhost:6379';
