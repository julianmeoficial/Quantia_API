# Deploy validation — staging Railway (ENG-125)

Checklist and notes to prove Quantia API staging is reachable without a Notion tunnel.

## Public URL

| Recurso | URL |
|---------|-----|
| API | `https://api-production-18cd.up.railway.app` |
| Health | `https://api-production-18cd.up.railway.app/api/v1/health` |
| Notion webhook | `https://api-production-18cd.up.railway.app/api/v1/webhooks/notion` |

## Infrastructure

| Pieza | Dónde |
|-------|--------|
| Postgres | Supabase project `xkzkvycvaxzzpftzwdav` |
| `DATABASE_URL` | Transaction pooler `:6543` + `pgbouncer=true` |
| `DIRECT_URL` | **Session pooler** `:5432` on same pooler host (Direct `db.*.supabase.co:5432` is IPv6-only from many networks) |
| Redis | Railway plugin `Redis` → `REDIS_URL=${{Redis.REDIS_URL}}` |
| Storage | Supabase Storage buckets `quantia-documents` / `quantia-reports` |
| Services | `api`, `worker`, `migrate`, `Redis` |

## Smoke checklist

```bash
# 1. Health (Postgres + Redis)
curl -sS https://api-production-18cd.up.railway.app/api/v1/health

# 2. Auth required
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://api-production-18cd.up.railway.app/api/v1/users/me
# expect 401

# 3. Request id header present
curl -sSI https://api-production-18cd.up.railway.app/api/v1/health | grep -i x-request-id
```

Then Notion:

1. Webhook URL → `https://api-production-18cd.up.railway.app/api/v1/webhooks/notion`
2. Paste `verification_token` from API logs into Notion **Verify**
3. Set `NOTION_WEBHOOK_SECRET` to that **same** token (it is the HMAC key; Notion does not show a separate “webhook secret”)
4. Redeploy api + worker; delete any cloudflared subscription
5. Edit sandbox page → `sync_events` row `SYNCED`

## Status (2026-09-19)

- [x] Health 200 on Railway staging
- [x] Webhook URL on Railway (no tunnel)
- [x] `verification_token` = `NOTION_WEBHOOK_SECRET` en `.env` local **y** Railway (`api` + `worker`); redeploy tras setear
- [x] Protected route without JWT → 401
- [ ] Manual smoke: Notion edit → `SYNCED` in Postgres

## F7 handoff

- OpenAPI / Bruno / inventory / seed / RLS: [`handoff-security.md`](./handoff-security.md)

## Findings from this validation

- Local machine **cannot** open Supabase Direct (`db.*:5432`) — AAAA only / IPv6.
- Pooler `:6543` and session pooler `:5432` are reachable over IPv4.
- Migrations F0–F5 applied to Supabase via session pooler as `DIRECT_URL`.
- Project token cannot `service source connect` to GitHub; deploys use `railway up` until an account token or dashboard GitHub link is used.

## Not in this PR

- Secrets (`.env`, Railway token)
- Production Hobby environment (October)
