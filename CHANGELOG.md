# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Docs: Notion webhook staging URL on Railway; clarify `NOTION_WEBHOOK_SECRET` equals the handshake `verification_token` (not the integration Access Token); tunnel is optional/local-only.
- Docs: Railway staging deploy validation notes (`deploy-validation.md`).
- F6 observability + Railway staging deploy (ENG-125): `nestjs-pino` JSON logs with `requestId` / `X-Request-Id`, CORS allowlist + optional Vercel preview origins, `railway.toml` + migrate script, docs in `docs/architecture/deploy.md`. Staging-only on trial; production deferred to Hobby.
- F5 presupuesto / documentos / reportes (ENG-124): modelos Budget/Document/Report/AuditLog (solo Postgres, sin Notion), StorageModule Supabase (buckets privados + signed URLs), AuditInterceptor, generación PDF/Excel en worker BullMQ (`reports`), alerta `presupuesto.ejecucion-baja` por subejecución, contracts 0.5.0, docs en `docs/architecture/budget-storage-reports.md`.
- F4 Socket.io realtime (ENG-123): namespaces `/projects` + `/notifications`, JWT handshake, membership `join`, Redis adapter + `quantia:realtime` bridge (API + worker via `RealtimeEmitter`), contract events, `CORS_ORIGINS`, docs in `docs/architecture/realtime.md`.
- F3 Notion sync (ENG-120): `NotionClient` (3 req/s + 429 retry), `POST /api/v1/webhooks/notion` with verification + HMAC, BullMQ jobs `sync:notion-to-db` / `sync:db-to-notion`, `sync_events` + User Notion mirror columns, enqueue after domain CRUD, docs in `docs/architecture/notion.md`.
- Docs: sección **NO OLVIDAR** para URL del webhook (túnel Cloudflare local → sustituir por Railway al desplegar + re-verificar + actualizar `NOTION_WEBHOOK_SECRET`).
- Fix: `tsconfig.build.json` con `incremental: false` para evitar `dist` vacío tras `deleteOutDir` en `nest start --watch`.
- F2 domain (ENG-122): `ProjectsModule`, `TasksModule`, `ProgressModule` with membership scoping in services, pagination/filters/sort, Prisma models + migration, seed demo (2 projects, cross members), unit coverage thresholds ≥70% on domain services, e2e `test/domain.e2e-spec.ts`, contracts for projects/tasks/progress, docs in `docs/architecture/domain.md`.
- F0 bootstrap (ENG-121): NestJS skeleton, ConfigModule with Zod validation, Prisma + Redis modules, `GET /api/v1/health`, worker stub, Docker Compose (postgres/redis/migrate/api/worker), multi-stage Dockerfile, GitHub Actions CI, `@quantia/contracts` workspace stub, README and docs.
- Architecture docs: package tree, folder guide, and documentation map in `docs/architecture/overview.md`.
- Docker containment docs: images, containers, multi-stage build and Compose boot order in `docs/architecture/docker.md`.
- F1 auth (ENG-119): users/roles/refresh_tokens, argon2, JWT 15m + rotating refresh with family revoke, global JwtAuthGuard/RolesGuard, `/auth/*` and `/users` endpoints, e2e 401/403/200, contracts + `docs/architecture/auth.md`.

### Fixed

- Docker image default stage is now `runner` (api/worker); `migrate` is an explicit build target so Compose no longer starts the API with `prisma migrate deploy`.
- Docker runner now copies `packages/contracts` so the `@quantia/contracts` workspace symlink resolves at runtime.
