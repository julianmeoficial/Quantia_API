# Deploy validation — staging Railway (ENG-125)

Checklist and notes to prove Quantia API staging is reachable without a Notion tunnel.

## Public URL

| Recurso | URL |
|---------|-----|
| API | `https://quantiaapi-production.up.railway.app` |
| Health | `https://quantiaapi-production.up.railway.app/api/v1/health` |
| Notion webhook | `https://quantiaapi-production.up.railway.app/api/v1/webhooks/notion` |

## Infrastructure

| Pieza | Dónde |
|-------|--------|
| Postgres | Supabase project `xkzkvycvaxzzpftzwdav` |
| `DATABASE_URL` | Transaction pooler `:6543` + `pgbouncer=true` |
| `DIRECT_URL` | **Session pooler** `:5432` (política staging ENG-156). Direct `db.*:5432` es IPv6-only en muchas redes y **no** es obligatorio en trial. |
| Redis | Railway plugin `Redis` → `REDIS_URL=${{Redis.REDIS_URL}}` |
| Storage | Supabase Storage buckets `quantia-documents` / `quantia-reports` |
| Services | **`Quantia_API`** (GitHub `main`, primario), `worker`, `migrate`, `Redis`; servicio `api` legacy deprecar |

## Deploy model

- **Primario:** merge a `main` → Railway auto-deploy del servicio `Quantia_API`.
- **Worker:** redeploy manual/CLI cuando cambian vars o hay que alinear imagen (hasta que también quede enlazado a GitHub).
- **No** uses `railway up` para la API salvo emergencia.

## Smoke checklist

```bash
# 1. Health (Postgres + Redis)
curl -sS https://quantiaapi-production.up.railway.app/api/v1/health

# 2. Auth required
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://quantiaapi-production.up.railway.app/api/v1/users/me
# expect 401

# 3. Request id header present
curl -sSI https://quantiaapi-production.up.railway.app/api/v1/health | grep -i x-request-id
```

Then Notion:

1. Webhook URL → `https://quantiaapi-production.up.railway.app/api/v1/webhooks/notion`
2. Paste `verification_token` from API logs into Notion **Verify**
3. Set `NOTION_WEBHOOK_SECRET` to that **same** token (it is the HMAC key; Notion does not show a separate “webhook secret”)
4. Redeploy `Quantia_API` + `worker`; delete any cloudflared / old `api-production-18cd` subscription
5. Edit sandbox page → `sync_events` row `SYNCED`

## Status (2026-09-20)

- [x] Health 200 on Railway staging (`quantiaapi-production`)
- [x] Webhook URL on GitHub-backed service (no tunnel)
- [x] Nueva suscripción Notion verificada; `NOTION_WEBHOOK_SECRET` en `.env` + Railway (`Quantia_API` + `worker`) y redeploy
- [x] Protected route without JWT → 401
- [x] Deploy unificado a GitHub (`Quantia_API`); dominio legacy `api-production-18cd` deprecar
- [x] Manual smoke: Notion edit → `sync_events` `SYNCED` (**ENG-159 Done**, 2026-09-20)

### ENG-159 evidence

| Campo | Valor |
|-------|--------|
| When (UTC) | `2026-09-20T22:09:27Z` (Notion edit) / `22:10:25Z` (confirmación) |
| Entity | `PROJECT` |
| `notion_page_id` | `3e08b2d8-659c-80b7-afd4-d73c4eee621e` (sandbox row **TESTING**) |
| `sync_events.status` | `SYNCED` (attempts=1) |
| Mirror | `projects.sync_status = SYNCED` for that page |
| Path | Webhook HTTPS → `Quantia_API` 200 → job `sync:notion-to-db` → worker |

## F7 handoff

- OpenAPI / Bruno / inventory / seed / RLS: [`handoff-security.md`](./handoff-security.md)

## Findings from this validation

- Supabase Direct (`db.*:5432`) is often AAAA-only / IPv6 — **staging policy:** use Session pooler `:5432` as `DIRECT_URL` (ENG-156 **Done**).
- Pooler `:6543` and session pooler `:5432` are reachable over IPv4.
- Migrations F0–F5 (+ RLS F7) applied to Supabase via session pooler as `DIRECT_URL`.
- ~~Project token cannot connect GitHub~~ → **resuelto (ENG-157):** servicio `Quantia_API` enlazado al repo; vars copiadas desde legacy `api`.

## Not in this PR

- Secrets (`.env`, Railway token)
- Production Hobby environment (October)
