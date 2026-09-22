# F7 — Handoff to Security (ENG-126)

Functional freeze of the Quantia NestJS API. From this point: **security fixes and defects only**.

Linear: [ENG-126](https://linear.app/brevku/issue/ENG-126/f7-estabilizacion-y-handoff-a-seguridad).

## Staging

| Resource | Value |
|----------|--------|
| API | `https://quantiaapi-production.up.railway.app` (**GitHub** service `Quantia_API`) |
| Health | `GET /api/v1/health` |
| Notion webhook | `POST /api/v1/webhooks/notion` (suscripción nueva 2026-09-19; secret = verification_token) |
| Deploy | merge → `main` auto-deploy; legacy `api` (`api-production-18cd…`) deprecar |
| Postgres | Supabase: Transaction pooler `:6543` (`DATABASE_URL`); **Session pooler** `:5432` (`DIRECT_URL`, política staging ENG-156) |
| Redis | Railway plugin |
| OpenAPI (committed) | [`openapi/openapi.json`](../../openapi/openapi.json) |
| Bruno collection | [`bruno/`](../../bruno/) |
| Inventory | [`inventory.md`](./inventory.md) |
| S1 threat model | [`../security/threat-model.md`](../security/threat-model.md) (ENG-127) |

Swagger UI is **not** mounted when `NODE_ENV=production` (staging). Import OpenAPI into Burp/ZAP or use Bruno.

## Test accounts (seed)

Fictional only — after `npm run prisma:seed` against staging / local:

| Email | Password | Role | Notes |
|-------|----------|------|-------|
| `admin@quantia.local` | `AdminPass1!` | ADMINISTRADOR | Full access |
| `coord@quantia.local` | `CoordPass1!` | COORDINADOR | Portfolio Alpha + Beta |
| `researcher@quantia.local` | `ResearchPass1!` | INVESTIGADOR | Member of **Alpha** only |
| `researcher-b@quantia.local` | `ResearchPass1!` | INVESTIGADOR | Member of **Beta** only (BOLA) |

Seed also creates budgets, one execution, document metadata stub, queued report row, and sample `audit_logs`.

```bash
# Local (Compose Postgres on :5433)
npm run prisma:seed

# Staging: point DIRECT_URL / DATABASE_URL at Supabase session/transaction poolers, then:
npm run prisma:seed
```

## OpenAPI + Bruno

```bash
# Requires local Postgres + Redis (same as API boot)
npm run openapi:export
# → openapi/openapi.json
```

Bruno: open the `bruno/` folder → environment **Staging** or **Local** → run `Auth / Login` → protected requests use `accessToken`.

## RLS (Supabase)

Migration `20260919000000_enable_rls`:

- `ENABLE ROW LEVEL SECURITY` on all app tables.
- `REVOKE ALL` from `anon` and `authenticated` when those roles exist.
- **No** `FORCE ROW LEVEL SECURITY` (would break Prisma owner/`postgres` via `DATABASE_URL`).
- **No** permissive policies for client keys.

Implication: PostgREST / publishable keys cannot read app data. The Nest API remains the only data path.

## Smoke checklist

```bash
curl -sS https://quantiaapi-production.up.railway.app/api/v1/health
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://quantiaapi-production.up.railway.app/api/v1/users/me
# expect 401

# Login seed admin
curl -sS -X POST https://quantiaapi-production.up.railway.app/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@quantia.local","password":"AdminPass1!"}'
```

Manual: Notion sandbox edit → `sync_events` `SYNCED` — **proven 2026-09-20** (ENG-159; see [`deploy-validation.md`](./deploy-validation.md)).

## Technical debt (Linear)

Classified under ENG-126:

| Class | Issue |
|-------|--------|
| ~~Blocking~~ **Done** | [ENG-156](https://linear.app/brevku/issue/ENG-156) Session pooler = política staging `DIRECT_URL` |
| ~~Blocking~~ **Done** | [ENG-157](https://linear.app/brevku/issue/ENG-157) GitHub connect — servicio `Quantia_API` + vars |
| ~~Non-blocking~~ **Done** | [ENG-158](https://linear.app/brevku/issue/ENG-158) Migrate `railway.toml` → `.railway/railway.ts` IaC |
| ~~Non-blocking~~ **Done** | [ENG-159](https://linear.app/brevku/issue/ENG-159) Manual Notion `SYNCED` smoke |

Swagger UI is off when `NODE_ENV=production` (staging); use `openapi/openapi.json` / Bruno instead.

## Freeze

Do **not** add domain features after F7 merge. Track debt in Linear as blocking / non-blocking. Pentest follows [`.cursor/rules/pentesting.md`](../../.cursor/rules/pentesting.md) on staging only.

## S6 EXIT → pentest P0

Hardening phases S1–S6 are complete when CI gates in [`../security/verification.md`](../security/verification.md) are green and the ASVS checklist is filled. Use the seed accounts above plus OpenAPI/Bruno as P0 inputs; test **staging only**.
