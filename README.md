# Quantia API

Backend NestJS para **Quantia**, plataforma de gestión de proyectos de investigación del semillero INNOVATEK'S (Grupo GITEMOS, Facultad de Ingeniería — Universidad de Cartagena).

Este repositorio contiene **solo la API**: REST versionada bajo `/api/v1`, worker BullMQ (sync Notion + reportes PDF/Excel) y health checks de infraestructura. Socket.io vive en el mismo contenedor que la API.

## Stack

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js 22 LTS, TypeScript strict |
| Framework | NestJS 11 |
| Base de datos | PostgreSQL 16 (Prisma 6; Supabase en staging) |
| Cache / colas / fanout | Redis 7 (`ioredis`, BullMQ, Socket.io Redis adapter) |
| Captura colaborativa | Notion API + webhooks firmados |
| Storage | Supabase Storage (buckets privados, URLs firmadas) |
| Auth | JWT HS256 + refresh rotativo, argon2 |
| Validación | Zod + `@nestjs/config`; DTOs con class-validator |
| Observabilidad | `nestjs-pino`, Helmet |
| Tests | Jest + Supertest |
| Contenedores | Docker multi-stage (`node:22-alpine`), Compose |

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
| `JWT_ACCESS_SECRET` | Secreto JWT acceso (≥ 32 chars) | (dev secret en `.env.example`) |
| `JWT_ACCESS_TTL` | Vida del access token | `15m` |
| `JWT_REFRESH_SECRET` | Secreto auxiliar refresh (≥ 32) | (dev secret en `.env.example`) |
| `JWT_REFRESH_TTL` | Vida del refresh token | `7d` |
| `CORS_ORIGINS` | Allowlist CSV para HTTP + Socket.io (nunca `*`) | `http://localhost:3000,...` |
| `NOTION_TOKEN` | Token integración Notion | (sandbox) |

La plantilla completa (issuer/audience JWT, Notion webhook, Supabase Storage, throttling, `CHAT_GENERAL_*`, etc.) está en [`.env.example`](.env.example). La aplicación **no arranca** si falta alguna variable obligatoria.

## Auth (F1)

| Método | Ruta | Acceso |
|--------|------|--------|
| `POST` | `/api/v1/auth/login` | Público |
| `POST` | `/api/v1/auth/refresh` | Público |
| `POST` | `/api/v1/auth/logout` | Público (body: `refreshToken`) |
| `GET` | `/api/v1/users/me` | JWT |
| `GET` | `/api/v1/users/directory?q=` | JWT + rol `ADMINISTRADOR` o `COORDINADOR` (búsqueda mínima para añadir miembros) |
| CRUD | `/api/v1/users` | JWT + rol `ADMINISTRADOR` |

Roles: `INVESTIGADOR`, `COORDINADOR`, `ADMINISTRADOR`. Passwords con argon2. Detalle: [`docs/architecture/auth.md`](docs/architecture/auth.md).

Todo `429` incluye `Retry-After` (segundos), expuesto por CORS para que el navegador pueda leerlo.

Swagger (no producción): `http://localhost:3000/api/docs`

Usuarios de desarrollo (tras `npm run prisma:seed` contra Postgres en `localhost:5433`):

| Email | Password | Rol |
|-------|----------|-----|
| `admin@quantia.local` | `AdminPass1!` | ADMINISTRADOR |
| `coord@quantia.local` | `CoordPass1!` | COORDINADOR |
| `researcher@quantia.local` | `ResearchPass1!` | INVESTIGADOR |
| `researcher-b@quantia.local` | `ResearchPass1!` | INVESTIGADOR |

El seed también crea **Proyecto Alpha** (miembro A) y **Proyecto Beta** (miembro B), presupuestos F5, un documento metadata stub, un reporte en cola y `audit_logs` de ejemplo.

## Dominio (F2)

| Método | Ruta | Acceso |
|--------|------|--------|
| CRUD | `/api/v1/projects` | JWT; create = Admin/Coord; list filtrado por pertenencia |
| Members | `/api/v1/projects/:id/members` | Admin o coordinador del proyecto |
| CRUD | `/api/v1/projects/:projectId/tasks` | JWT + acceso al proyecto |
| CRUD | `/api/v1/projects/:projectId/progress` | JWT + acceso al proyecto |

Detalle de pertenencia y filtros: [`docs/architecture/domain.md`](docs/architecture/domain.md).

## Notion, presupuesto, documentos y reportes (F3–F5)

| Método | Ruta | Acceso |
|--------|------|--------|
| `POST` | `/api/v1/webhooks/notion` | Público + HMAC / handshake |
| CRUD | `/api/v1/projects/:projectId/budget` | JWT; mutaciones Admin/Coord |
| Upload / list / download / delete | `/api/v1/projects/:projectId/documents` | JWT + acceso al proyecto |
| `POST` / `GET` | `/api/v1/projects/:projectId/reports` | JWT; generación async (202) |

El worker consume las colas BullMQ `notion-sync` (`sync:notion-to-db`, `sync:db-to-notion`) y `reports` (`report:generate`). Inventario canónico: [`docs/architecture/inventory.md`](docs/architecture/inventory.md).

## Chat General y realtime

| Método | Ruta / namespace | Acceso |
|--------|-----------------|--------|
| `POST` / `GET` | `/api/v1/chat/general/messages` | JWT; flag `CHAT_GENERAL_ENABLED` |
| Socket.io | `/projects`, `/notifications`, `/general` | JWT en handshake |

Detalle: [`docs/architecture/chat-general.md`](docs/architecture/chat-general.md) · [`docs/architecture/realtime.md`](docs/architecture/realtime.md).

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run start:dev` | API en modo watch |
| `npm run worker:dev` | Worker BullMQ en modo watch |
| `npm run worker:prod` | Worker en producción (`node dist/worker`) |
| `npm run build` | Compila API + `@quantia/contracts` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Tests unitarios |
| `npm run test:cov` | Unitarios con cobertura |
| `npm run test:e2e` | Tests e2e (requiere Postgres + Redis) |
| `npm run audit:ci` | SCA: falla en vulns high/critical de deps **directas** (ENG-132) |
| `npm run prisma:migrate:dev` | Crear/aplicar migraciones en dev |
| `npm run prisma:migrate:deploy` | Aplicar migraciones (CI / staging) |
| `npm run prisma:seed` | Seed demo: 4 users, Alpha/Beta, budgets F5 |
| `npm run openapi:export` | Genera `openapi/openapi.json` (requiere DB+Redis) |

## Estructura del repositorio

```
src/
  auth/         Login, refresh, logout, JWT
  users/        /users/me + CRUD admin
  projects/     CRUD proyectos + members (F2)
  tasks/        CRUD tareas anidadas (F2)
  progress/     CRUD avances / evidencias (F2)
  notion/       Webhook + NotionClient + sync enqueue (F3)
  realtime/     Socket.io gateways + Redis bridge (F4)
  budget/       Presupuesto y ejecuciones (F5, solo Postgres)
  documents/    Uploads + URLs firmadas (F5)
  reports/      Encolado PDF/Excel (F5)
  storage/      Adaptador Supabase Storage
  audit/        AuditInterceptor + logs inmutables
  chat-general/ Chat General del semillero (ENG-171)
  common/       Guards, decorators, filters, ProjectAccessService
  config/       ConfigModule + validación Zod
  database/     PrismaService
  redis/        RedisService
  health/       GET /api/v1/health (@Public)
  worker.ts     Entry del worker (notion-sync + reports)
packages/
  contracts/    @quantia/contracts 0.7.0 (auth, users, http, domain, realtime, notion, budget, documents, reports, chat-general)
prisma/         Schema y migraciones
test/           E2E
docs/           Documentación técnica
```

## Seguridad (S1–S6 / ENG-117)

Endurecimiento post-F7: OWASP API Top 10 + ASVS L1–L2. Evidencia en [`docs/security/`](docs/security/README.md); cierre formal en [`docs/security/eng-117-closure.md`](docs/security/eng-117-closure.md). Cuentas seed y handoff: [`docs/architecture/handoff-security.md`](docs/architecture/handoff-security.md).

| Fase | Tema |
|------|------|
| S1 | Modelado de amenazas (STRIDE) |
| S2 | AuthN / AuthZ (BOLA, BFLA) |
| S3 | Validación, exposición, uploads |
| S4 | Infra, secretos, contenedor |
| S5 | Rate limit, auditoría, logs |
| S6 | SAST / SCA / checklist ASVS |

## CI/CD

GitHub Actions en cada PR y push a `main`:

| Workflow | Qué hace |
|----------|----------|
| [`ci.yml`](.github/workflows/ci.yml) job `secrets` | gitleaks (historial incluido) |
| [`ci.yml`](.github/workflows/ci.yml) job `verify` | `npm ci` → `npm run audit:ci` → migrate → lint (incl. `eslint-plugin-security`) → typecheck → unit + e2e → `docker build` → Trivy OS (CRITICAL/HIGH) |
| [`codeql.yml`](.github/workflows/codeql.yml) | CodeQL `security-extended` + gate SARIF (sin upload GHAS) |

## Documentación

| Documento | Contenido |
|-----------|-----------|
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | Arquitectura, árbol de paquetería, guía de carpetas |
| [`docs/architecture/docker.md`](docs/architecture/docker.md) | Imágenes y contenedores Docker, stages, flujo de arranque |
| [`docs/architecture/auth.md`](docs/architecture/auth.md) | Auth JWT, roles, refresh rotativo (F1 / ENG-119) |
| [`docs/architecture/domain.md`](docs/architecture/domain.md) | Proyectos, tareas, avances y pertenencia (F2 / ENG-122) |
| [`docs/architecture/notion.md`](docs/architecture/notion.md) | Sync Notion ↔ Postgres. Webhook staging: Railway HTTPS; `NOTION_WEBHOOK_SECRET` = `verification_token` del handshake (no el Access Token). |
| [`docs/architecture/realtime.md`](docs/architecture/realtime.md) | Socket.io namespaces, JWT handshake, rooms, Redis bridge (F4 / ENG-123) |
| [`docs/architecture/chat-general.md`](docs/architecture/chat-general.md) | Chat General del semillero (`/general`, presencia Redis) |
| [`docs/architecture/chat-general-closure.md`](docs/architecture/chat-general-closure.md) | Cierre ENG-173 / criterios de aceptación |
| [`docs/architecture/budget-storage-reports.md`](docs/architecture/budget-storage-reports.md) | Presupuesto (solo Postgres), Storage firmado, reportes async PDF/Excel (F5 / ENG-124) |
| [`docs/architecture/deploy.md`](docs/architecture/deploy.md) | Railway staging, migrate, logs JSON, CORS, Notion HTTPS sin túnel (F6 / ENG-125) |
| [`docs/architecture/deploy-validation.md`](docs/architecture/deploy-validation.md) | Checklist smoke staging + URLs + hallazgo IPv6 Direct vs Session pooler |
| [`docs/architecture/inventory.md`](docs/architecture/inventory.md) | Inventario endpoints / WS / jobs / tablas (F7) |
| [`docs/architecture/handoff-security.md`](docs/architecture/handoff-security.md) | Handoff Seguridad: cuentas seed, OpenAPI/Bruno, RLS, freeze |
| [`docs/security/README.md`](docs/security/README.md) | Índice S1–S6: threat model, hardening, verification, ASVS |
| [`docs/security/eng-117-closure.md`](docs/security/eng-117-closure.md) | Cierre ENG-117: criterios de aceptación y trazabilidad |
| [`docs/pentesting/README.md`](docs/pentesting/README.md) | Programa P0–P6 (laboratorio local, consola) |
| [`docs/development/local-setup.md`](docs/development/local-setup.md) | Cómo correr localmente (Compose o host) |
| [`openapi/openapi.json`](openapi/openapi.json) | OpenAPI 3 export |
| [`bruno/`](bruno/) | Colección Bruno manual |

## Roadmap

| Fase | Tema | Estado | Linear |
|------|------|--------|--------|
| F0–F7 | API funcional + handoff | Completado | ENG-116 / ENG-126 |
| S1–S6 | Endurecimiento OWASP/ASVS | Completado | ENG-117 |
| P0–P6 | Verificación ofensiva (local / consola) | Completado | ENG-118 |
| Chat General | Room autenticada del semillero | Completado | ENG-171 / ENG-172 / ENG-173 |

**Congelamiento funcional** desde F7: solo fixes de seguridad y defectos. El pentest P0–P6 se ejecutó contra el lab local (Compose); staging queda fuera del alcance ofensivo (smoke no ofensivo documentado en P6).

## Contribución

- Ramas: `feature/*` → PR → `main`
- Commits: [Conventional Commits](https://www.conventionalcommits.org/)
- Reglas del agente: `.cursorrules` y `.cursor/rules/`
