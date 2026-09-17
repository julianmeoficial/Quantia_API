import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://quantia:quantia@localhost:5432/quantia',
    DIRECT_URL: 'postgresql://quantia:quantia@localhost:5432/quantia',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'quantia-test-access-secret-change-me-32',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_SECRET: 'quantia-test-refresh-secret-change-me-32',
    JWT_REFRESH_TTL: '7d',
  };

  it('accepts a valid environment', () => {
    const result = validateEnv(validEnv);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('test');
    expect(result.JWT_ACCESS_TTL).toBe('15m');
  });

  it('rejects missing DATABASE_URL', () => {
    const { DATABASE_URL, ...incomplete } = validEnv;
    void DATABASE_URL;
    expect(() => validateEnv(incomplete)).toThrow(
      'Environment validation failed',
    );
  });

  it('rejects missing REDIS_URL', () => {
    const { REDIS_URL, ...incomplete } = validEnv;
    void REDIS_URL;
    expect(() => validateEnv(incomplete)).toThrow(
      'Environment validation failed',
    );
  });

  it('rejects short JWT_ACCESS_SECRET', () => {
    expect(() =>
      validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow('Environment validation failed');
  });
});
