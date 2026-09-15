# Quantia API

Backend NestJS para **Quantia**, plataforma de gestión de proyectos de investigación del semillero INNOVATEK'S (Grupo GITEMOS, Facultad de Ingeniería — Universidad de Cartagena).

Este repositorio contiene **solo la API**: REST versionada bajo `/api/v1`, worker BullMQ (stub en F0) y health checks de infraestructura.

## Stack

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js 22 LTS, TypeScript strict |
| Framework | NestJS 11 |
| Base de datos | PostgreSQL 16 (Prisma) |
| Cache / colas | Redis 7 (ioredis) |
| Validación env | Zod + `@nestjs/config` |
| Tests | Jest + Supertest |
| Contenedores | Docker multi-stage, Compose |

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recomendado)
- Node.js 22+ (solo desarrollo local sin Docker)

## Inicio rápido

```bash
cp .env.example .env
docker compose up --build
```

Verificación:

```bash
curl http://localhost:3000/api/v1/health
```

Respuesta esperada: HTTP **200** con `database` y `redis` en estado `up`.

## Variables de entorno

| Variable | Descripción | Ejemplo (Compose) |
|----------|-------------|-------------------|
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto HTTP de la API | `3000` |
| `DATABASE_URL` | Conexión Postgres (app) | `postgresql://quantia:quantia@postgres:5432/quantia` |
| `DIRECT_URL` | Conexión directa (migraciones) | `postgresql://quantia:quantia@postgres:5432/quantia` |
| `REDIS_URL` | Conexión Redis | `redis://redis:6379` |

La aplicación **no arranca** si falta alguna variable obligatoria.

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | API en modo watch |
| `npm run worker:dev` | Worker stub en modo watch |
| `npm run build` | Compila API + `@quantia/contracts` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Tests unitarios |
| `npm run test:e2e` | Tests e2e (requiere Postgres + Redis) |
| `npm run prisma:migrate:dev` | Crear/aplicar migraciones en dev |

## Estructura del repositorio

```
src/
  config/       ConfigModule + validación Zod
  database/     PrismaService
  redis/        RedisService
  health/       GET /api/v1/health
  worker.ts     Entry del worker
packages/
  contracts/    @quantia/contracts (stub F0)
prisma/         Schema y migraciones
test/           E2E
docs/           Documentación técnica
```

## CI/CD

GitHub Actions ejecuta en cada PR y push a `main`:

1. `npm ci`
2. `prisma migrate deploy`
3. lint + typecheck
4. tests unitarios y e2e (con Postgres y Redis como services)
5. `docker build`

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | Arquitectura, árbol de paquetería, guía de carpetas |
| [`docs/architecture/docker.md`](docs/architecture/docker.md) | Imágenes y contenedores Docker, stages, flujo de arranque |
| [`docs/development/local-setup.md`](docs/development/local-setup.md) | Cómo correr localmente (Compose o host) |

## Roadmap

Desarrollo incremental F0–F7. Issue actual: [ENG-121 — F0 Bootstrap](https://linear.app/brevku/issue/ENG-121/f0-bootstrap-del-repositorio-y-del-entorno).

| Fase | Tema |
|------|------|
| F0 | Bootstrap + Docker + CI |
| F1 | Auth JWT + roles |
| F2 | Proyectos, tareas, avances |
| F3 | Sync Notion |
| F4 | Socket.io tiempo real |
| F5 | Presupuesto, documentos, reportes |
| F6 | Observabilidad + Railway |
| F7 | Estabilización / handoff Seguridad |

## Contribución

- Ramas: `feature/*` → PR → `main`
- Commits: [Conventional Commits](https://www.conventionalcommits.org/)
- Reglas del agente: `.cursorrules` y `.cursor/rules/`
