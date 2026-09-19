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
    CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    CORS_VERCEL_PREVIEW: 'false',
    NOTION_TOKEN: 'ntn_test_token_placeholder',
    NOTION_WEBHOOK_SECRET: 'whsec_test_secret',
    NOTION_VERSION: '2025-09-03',
    NOTION_RATE_LIMIT_RPS: '3',
    NOTION_SYNC_MAX_ATTEMPTS: '5',
    NOTION_SANDBOX_PAGE_ID: '3df8b2d8-659c-808d-890f-d25b0213aacd',
    NOTION_DB_USERS: '182336f1-ce31-4495-bd88-f168bf3aa3bc',
    NOTION_DS_USERS: '6a429964-8f61-43c9-952d-1e68fb3e578c',
    NOTION_DB_PROJECTS: '5c857af6-f89c-41a4-9ed6-e59af6a53454',
    NOTION_DS_PROJECTS: 'f34435f4-95c6-4e98-b808-c2cc93a563ca',
    NOTION_DB_TASKS: '9d0bd14e-6be8-4f99-9de6-8375f8600770',
    NOTION_DS_TASKS: 'f5f6ecfa-e866-4234-b481-19849da9944f',
    NOTION_DB_PROGRESS: '950366a7-30f3-4f00-9094-a2d1af9209d9',
    NOTION_DS_PROGRESS: '59238cc9-6691-414e-af53-bcd9648e9897',
    NOTION_DB_SYNC_LOG: 'a1c62fe1-d457-4a7d-b16a-c360786b7520',
    NOTION_DS_SYNC_LOG: 'f3e4e43d-185a-41c2-9eb9-7bf8303892b8',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'supabase_test_service_role_key',
  };

  it('accepts a valid environment', () => {
    const result = validateEnv(validEnv);
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('test');
    expect(result.JWT_ACCESS_TTL).toBe('15m');
    expect(result.NOTION_RATE_LIMIT_RPS).toBe(3);
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

  it('rejects missing NOTION_TOKEN', () => {
    const { NOTION_TOKEN, ...incomplete } = validEnv;
    void NOTION_TOKEN;
    expect(() => validateEnv(incomplete)).toThrow(
      'Environment validation failed',
    );
  });

  it('rejects CORS_ORIGINS with wildcard', () => {
    expect(() => validateEnv({ ...validEnv, CORS_ORIGINS: '*' })).toThrow(
      'Environment validation failed',
    );
  });

  it('parses CORS_VERCEL_PREVIEW boolean strings', () => {
    expect(
      validateEnv({ ...validEnv, CORS_VERCEL_PREVIEW: 'true' })
        .CORS_VERCEL_PREVIEW,
    ).toBe(true);
    expect(
      validateEnv({ ...validEnv, CORS_VERCEL_PREVIEW: 'false' })
        .CORS_VERCEL_PREVIEW,
    ).toBe(false);
  });
});
