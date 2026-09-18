# Local development setup

## Option A — Docker Compose (recommended)

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:3000/api/v1/health
# Seed demo users (host → Postgres on localhost:5433)
cp .env.test .env.seed.local 2>/dev/null || true
DATABASE_URL=postgresql://quantia:quantia@localhost:5433/quantia \
DIRECT_URL=postgresql://quantia:quantia@localhost:5433/quantia \
  npm run prisma:seed
```

## Option B — Host Node.js + containerized data services

Start only infrastructure:

```bash
docker compose up postgres redis -d
cp .env.test .env
npx prisma migrate deploy
npm run start:dev
```

Adjust `.env` URLs to use `localhost` instead of Docker service names. Postgres is exposed on host port **5433** (to avoid conflicts with a local PostgreSQL on 5432).

If `npm run start:dev` fails with `Cannot find module '.../dist/main'`, Nest wiped `dist` (`deleteOutDir`) while TypeScript incremental skipped re-emit. Fix:

```bash
rm -f tsconfig.build.tsbuildinfo
npx tsc -p tsconfig.build.json --incremental false
DATABASE_URL=postgresql://quantia:quantia@localhost:5433/quantia \
DIRECT_URL=postgresql://quantia:quantia@localhost:5433/quantia \
REDIS_URL=redis://localhost:6379 \
  node dist/main.js
```

(If your `.env` still has hostnames `postgres`/`redis` from Compose, those overrides are required on the host.)

## Running tests

Unit tests (no external services):

```bash
npm run test
```

E2E tests require Postgres and Redis:

```bash
docker compose up postgres redis -d
npx prisma migrate deploy
npm run test:e2e
```

## Worker

```bash
npm run worker:dev
```

Expected log: worker Nest app ready (BullMQ `notion-sync` consumer in F3).

## Webhook Notion (túnel local)

Notion no alcanza `localhost`. Con la API en `:3000`:

```bash
docker run --rm cloudflare/cloudflared:latest \
  tunnel --url http://host.docker.internal:3000
```

URL a registrar en Notion:

```text
https://<subdominio>.trycloudflare.com/api/v1/webhooks/notion
```

**Al desplegar en Railway:** sustituye esa URL en la suscripción de Notion, re-verifica y actualiza `NOTION_WEBHOOK_SECRET`. Detalle y checklist: [`docs/architecture/notion.md`](../architecture/notion.md) (sección **NO OLVIDAR**).
