# Local development setup

## Option A — Docker Compose (recommended)

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:3000/api/v1/health
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

## Worker stub

```bash
npm run worker:dev
```

Expected log: `Worker ready`.
