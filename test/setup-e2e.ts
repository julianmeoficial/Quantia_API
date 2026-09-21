process.env.NODE_ENV ??= 'test';
process.env.APP_ENV ??= 'test';
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
process.env.JWT_ISSUER ??= 'quantia-api';
process.env.JWT_AUDIENCE ??= 'quantia-clients';
process.env.CORS_ORIGINS ??= 'http://localhost:3000,http://127.0.0.1:3000';
process.env.CORS_VERCEL_PREVIEW ??= 'false';

process.env.NOTION_TOKEN ??= 'ntn_test_token_placeholder_for_e2e';
process.env.NOTION_WEBHOOK_SECRET ??= 'whsec_test_webhook_secret_for_e2e';
process.env.NOTION_VERSION ??= '2025-09-03';
process.env.NOTION_RATE_LIMIT_RPS ??= '3';
process.env.NOTION_SYNC_MAX_ATTEMPTS ??= '5';
process.env.NOTION_WEBHOOK_MAX_SKEW_SECONDS ??= '300';
process.env.NOTION_SANDBOX_PAGE_ID ??= '3df8b2d8-659c-808d-890f-d25b0213aacd';
process.env.NOTION_DB_USERS ??= '182336f1-ce31-4495-bd88-f168bf3aa3bc';
process.env.NOTION_DS_USERS ??= '6a429964-8f61-43c9-952d-1e68fb3e578c';
process.env.NOTION_DB_PROJECTS ??= '5c857af6-f89c-41a4-9ed6-e59af6a53454';
process.env.NOTION_DS_PROJECTS ??= 'f34435f4-95c6-4e98-b808-c2cc93a563ca';
process.env.NOTION_DB_TASKS ??= '9d0bd14e-6be8-4f99-9de6-8375f8600770';
process.env.NOTION_DS_TASKS ??= 'f5f6ecfa-e866-4234-b481-19849da9944f';
process.env.NOTION_DB_PROGRESS ??= '950366a7-30f3-4f00-9094-a2d1af9209d9';
process.env.NOTION_DS_PROGRESS ??= '59238cc9-6691-414e-af53-bcd9648e9897';
process.env.NOTION_DB_SYNC_LOG ??= 'a1c62fe1-d457-4a7d-b16a-c360786b7520';
process.env.NOTION_DS_SYNC_LOG ??= 'f3e4e43d-185a-41c2-9eb9-7bf8303892b8';
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'supabase_test_service_role_key';
process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS ??= 'quantia-documents';
process.env.SUPABASE_STORAGE_BUCKET_REPORTS ??= 'quantia-reports';
process.env.STORAGE_SIGNED_URL_TTL_SECONDS ??= '300';
process.env.STORAGE_MAX_UPLOAD_BYTES ??= '26214400';
process.env.STORAGE_ALLOWED_MIME ??=
  'application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
