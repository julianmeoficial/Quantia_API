import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://quantia:quantia@localhost:5432/quantia',
    DIRECT_URL: 'postgresql://quantia:quantia@localhost:5432/quantia',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('accepts a valid environment', () => {
    const result = validateEnv(validEnv);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('test');
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
});
