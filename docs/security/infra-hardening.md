# S4 — Infraestructura, secretos y despliegue (ENG-130)

Hardening against **OWASP API8** (Security Misconfiguration), **API9** (inventory) and **API10** (unsafe consumption of APIs / Notion webhook).

Linear: [ENG-130](https://linear.app/brevku/issue/ENG-130/s4-infraestructura-secretos-y-despliegue).  
Branch convention: `Security_S4`.

## Secrets

| Where | What |
|-------|------|
| Railway (API + worker) | All runtime secrets: `JWT_*`, `NOTION_*`, `SUPABASE_*`, `DATABASE_URL`, `REDIS_URL` |
| Vercel (frontend) | Only public API URL / publishable keys — **never** `service_role` or Notion tokens |
| GitHub Actions | CI placeholders only (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) |
| Repo | [`.env.example`](../../.env.example) + [`.env.test`](../../.env.test) placeholders; `.env` gitignored |

**CI:** `gitleaks` runs on every PR with full git history (`fetch-depth: 0`). Any real secret in history fails the build.

### Rotation procedures

#### `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`

1. Generate new high-entropy secrets (≥32 chars).
2. Set them on Railway for **API and worker** (same values).
3. Redeploy. Existing access tokens expire within `JWT_ACCESS_TTL` (15m).
4. Refresh tokens signed/hashed with the old secret become invalid — users must log in again.
5. Optionally bump `JWT_ISSUER` / `JWT_AUDIENCE` per environment so staging tokens never work in production.

#### `NOTION_TOKEN` (integration access token)

1. In Notion: Integrations → revoke / regenerate Internal Integration Token.
2. Update `NOTION_TOKEN` on Railway (`Quantia_API` + `worker`).
3. Redeploy. Sync jobs use the new token immediately.

#### `NOTION_WEBHOOK_SECRET` (handshake `verification_token`)

Notion does **not** re-expose the token after verify. To rotate:

1. Delete the webhook subscription in Notion.
2. Create a new subscription pointing at the HTTPS webhook URL on **Quantia_API**.
3. Complete Verify with the handshake `verification_token` (capture from the HTTP response at handshake time; Network/Deploy Logs do **not** show the body — T-08).
4. Set `NOTION_WEBHOOK_SECRET` to that same value on Railway (`Quantia_API` + `worker`); redeploy.

## Supabase `service_role` + RLS

- `SUPABASE_SERVICE_ROLE_KEY` is loaded only in the Nest container via [`StorageService`](../../src/storage/storage.service.ts).
- Migration [`20260919000000_enable_rls`](../../prisma/migrations/20260919000000_enable_rls/migration.sql): `ENABLE ROW LEVEL SECURITY` on all app tables + `REVOKE` from `anon` / `authenticated`.
- No `FORCE ROW LEVEL SECURITY` (Prisma owner role must keep working).
- Publishable / anon keys must never ship to the browser for app data.

## Container

[`Dockerfile`](../../Dockerfile):

- Base `node:22-alpine`
- Final stage `USER node` (non-root)
- `ENV NODE_ENV=production`
- No shell debugging tools added in the runner stage
- `HEALTHCHECK` → `GET /api/v1/health`

**CI:** after `docker build`, Trivy scans `CRITICAL,HIGH` (`ignore-unfixed: true`); findings fail the job.

## HTTP headers and CORS

[`src/main.ts`](../../src/main.ts):

- `helmet()` with HSTS (`maxAge` 15552000, includeSubDomains); CSP on (Helmet defaults in production; local/dev relaxes `script-src`/`style-src` for Swagger UI)
- Express `disable('x-powered-by')`
- CORS allowlist via [`cors.util.ts`](../../src/common/cors.util.ts); never `*`
- `CORS_VERCEL_PREVIEW` allowed on staging only; **rejected at boot** when `APP_ENV=production`

## Environment isolation (`APP_ENV`)

| Variable | Staging | Production |
|----------|---------|------------|
| `NODE_ENV` | `production` | `production` |
| `APP_ENV` | `staging` | `production` |
| DB / Redis / JWT | Dedicated | Dedicated (different secrets) |
| `CORS_VERCEL_PREVIEW` | `true` (previews) | **must be `false`** |
| Swagger UI | Off (`NODE_ENV=production`) | Off |
| OpenAPI | [`openapi/openapi.json`](../../openapi/openapi.json) | same |

Swagger mounts only when `NODE_ENV !== 'production'` (local/dev/test). Deployed staging and production are intentionally stricter than the ENG-130 minimum (“Swagger on staging or auth-protected in prod”).

## Notion webhook

[`NotionWebhookController`](../../src/notion/notion-webhook.controller.ts):

1. Handshake: returns `verification_token` in JSON; logs **without** the token value.
2. HMAC-SHA256 of raw body vs `X-Notion-Signature`; `timingSafeEqual`.
3. Timestamp must be within `NOTION_WEBHOOK_MAX_SKEW_SECONDS` (default 300).
4. Redis `SET NX` on `notion:webhook:replay:<sha256(signature)>` with TTL = skew — replays → **401**.

## Redis network

Railway Redis is private to the project. Prefer `rediss://` when TLS is available. Job producers are only the Nest API/worker — no untrusted enqueue sources.

## Exit criteria

- [x] Repo: no committed secrets; gitleaks in CI
- [x] Image: non-root alpine + trivy gate
- [x] Headers: helmet / HSTS / no `X-Powered-By`
- [x] Prod stricter than staging (`APP_ENV` + CORS refine)
- [x] Webhook: signature, window, anti-replay
- [x] RLS + service_role only in API container
