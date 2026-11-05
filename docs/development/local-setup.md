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
# Seed: 4 users (admin/coord/2 researchers), Alpha/Beta, budgets F5, audit stubs
```

Export OpenAPI (API boot deps required):

```bash
npm run openapi:export
# → openapi/openapi.json
```

Manual HTTP: open the [`bruno/`](../../bruno/) collection (env Local or Staging).


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

## Webhook Notion

**Staging (actual):**  
`https://quantiaapi-production.up.railway.app/api/v1/webhooks/notion`  
Ver [`deploy-validation.md`](../architecture/deploy-validation.md). **No uses túnel**
mientras staging esté arriba.

`NOTION_WEBHOOK_SECRET` = el `verification_token` del handshake (mismo valor que
pegas en Verify). No confundirlo con el Access Token de la integración.

**Dev local opcional** (sin staging):

```bash
docker run --rm cloudflare/cloudflared:latest \
  tunnel --url http://host.docker.internal:3000
```

Detalle: [`notion.md`](../architecture/notion.md) (sección **NO OLVIDAR**).

## Socket.io (F4)

Con la API arriba y `CORS_ORIGINS` configurado:

```bash
# Cliente de prueba (Node)
node -e "
const { io } = require('socket.io-client');
const s = io('http://127.0.0.1:3000/projects', { auth: { token: process.env.TOKEN } });
s.on('authenticated', () => s.emit('join', { projectId: process.env.PROJECT_ID }));
s.on('joined', console.log);
s.on('tarea.actualizada', console.log);
"
```

Detalle: [`docs/architecture/realtime.md`](../architecture/realtime.md).

Chat General (`/general`) de punta a punta, con cliente de referencia y pruebas con `curl`: [`chat-e2e-integration.md`](./chat-e2e-integration.md).
