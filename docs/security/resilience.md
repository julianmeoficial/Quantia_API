# S5 — Resilience, audit & observability (ENG-131)

Controls for unbounded use (T-14), login spam completion (T-04*), and immutable audit (T-20).

## Rate limiting (Redis)

`ThrottlerModule` uses `RedisThrottlerStorage` (`throttle:{name}:{key}`).

| Named throttler | Default | Applies to |
|-----------------|---------|------------|
| `default` | 120 req / 60s | Authenticated REST (except skipped) |
| `auth` | 10 req / 60s | `/api/v1/auth/*` only (`skipIf` elsewhere) |
| `reports` | 5 req / 60s | `POST …/reports` only |
| — | skipped | `/api/v1/health` (`@SkipThrottle`) |

Env overrides: `THROTTLE_DEFAULT_*`, `THROTTLE_AUTH_*`, `THROTTLE_REPORTS_*` (`TTL_MS`, `LIMIT`).

Auth and reports controllers also `@SkipThrottle` the other named buckets so only the intended limit applies.

## HTTP quotas

| Quota | Value | Mechanism |
|-------|-------|-----------|
| JSON body size | `1mb` (`HTTP_JSON_BODY_LIMIT`) | Express `json`/`urlencoded` → **413** |
| JSON depth | max **10** (`HTTP_JSON_MAX_DEPTH`) | Middleware → **400** |
| `pageSize` | max **50** | `PaginationQueryDto` `@Max(50)` → **400** |
| Upload | 1 file / request, size/MIME from Storage config | Multer (documents) |

## WebSocket limits

| Limit | Default | Redis key |
|-------|---------|-----------|
| Connections / user | 5 | `ws:conn:{userId}` (SET) |
| Events / socket / s | 30 | `ws:evt:{socketId}` |
| Idle | `pingTimeout` ≈ 60s (`WS_IDLE_TIMEOUT_MS`) | Socket.io adapter |

Excess connections are disconnected with `error: Too many connections`. Excess events return `{ ok: false, error: 'Event rate limit exceeded' }` on `join`.

## Audit log

- Interceptor + `RolesGuard` cover mutations under `/auth`, `/users`, `/projects`, `/tasks`, `/progress`, `/budget`, `/documents`, `/reports`, `/webhooks/notion`.
- Role denials **await** `AuditService.log` before throwing 403 (no race with e2e reads).
- Explicit security rows: `LOGIN_FAILED`, `LOGIN_LOCKOUT`, `REFRESH_REUSE`, `WEBHOOK_REJECTED` (metadata reasons only; passwords/tokens redacted).
- Postgres trigger `audit_logs_immutable` blocks `UPDATE`/`DELETE` unless session GUC `app.audit_mutable=1` (seed/e2e cleanup only). Exception: FK `ON DELETE SET NULL` on `actor_id` is allowed so user deletion does not rewrite audit history.

## Alerts (Hobby-friendly)

`SecurityMetricsService` increments Redis `security:http:{401|403}:min` and emits structured `Logger.warn` when count hits `SECURITY_ALERT_401_403_THRESHOLD` (default 50 / ~60s).

Suggested Railway / log rules (no Railway API integration in-app):

1. Match log message `Security alert: * HTTP 401` or `403` → notify Slack/email.
2. Match `sync_status` / worker errors containing `FAILED` or Notion 429 exhaustion.
3. Match `WS connection limit reached` / `WS event rate exceeded`.

## Threat mapping

| Threat | Control |
|--------|---------|
| T-04* | Auth throttler + existing login lockout |
| T-14 | Throttler, pageSize 50, body/depth, WS caps, report quota |
| T-20 | Broad audit paths, sanitize metadata, append-only trigger |
