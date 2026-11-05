# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Chat General v2 (estilo Telegram):** avatar obligatorio de 5 predefinidos (`GET /users/avatars`, `PATCH /users/me/avatar`; sin subida de fotos; `GET /users/me` expone `avatar` y `avatarRequired`); respuestas (`replyToId`), edición con ventana (`PATCH`), borrado con tombstone y moderación Admin (`DELETE`), reacciones de un allowlist con una por usuario (`PUT`/`DELETE …/reaction`), punteros de lectura y no leídos (`PUT /chat/general/read`, `GET /chat/general/state`), feed de cambios para reconexión (`GET /chat/general/updates`), `seq`/`version` en cada mensaje, typing y reautenticación por socket con ack, `lastSeenAt`. Eventos nuevos `chat.general.mensaje-editado`, `.mensaje-eliminado`, `.reacciones-actualizadas`, `.escribiendo`, `.lectura`, `.usuario-actualizado`. Migración aditiva `20261105000000_chat_general_v2_avatars`. Contracts 0.8.0. Guía: [`docs/development/chat-e2e-integration.md`](docs/development/chat-e2e-integration.md).
- Cuerpo de error HTTP con `code` opcional y estable (p. ej. `AVATAR_REQUIRED`).

### Changed

- `CHAT_GENERAL_ENABLED` pasa a **`true` por defecto** (sigue siendo kill switch con `false`).
- `WS_MAX_CONNECTIONS_PER_USER` default 5 → 10.
- Historial del chat ordenado y paginado por `seq` (cursor opaco nuevo; los cursores antiguos dejan de ser válidos).
- `PresenceUser` incluye `avatar`; `avatarUrl` queda deprecado (siempre `null`).

### Fixed

- Contadores de sockets "fantasma" tras redeploys/crash que bloqueaban con `Too many connections` (ZSET con heartbeat + `enableShutdownHooks()`).
- Mensaje persistido cuyo fanout falló: el reintento idempotente ahora re-emite `mensaje-creado`.
- Socket `/general` seguía recibiendo mensajes con el JWT vencido o el usuario desactivado: se cierra a `exp` + gracia salvo reautenticación.
- OpenAPI sin schemas de respuesta en las rutas del chat.

## [0.1.0] - 2026-10-22

### Changed

- **Rotación de secretos post-incidente Railway (21–22 oct 2026):** tras el [aviso de Railway](https://blog.railway.com/p/security-disclosure-wednesday-october-21st), se rotaron en staging (`Quantia_API` + `worker`) `DATABASE_URL` / `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, JWT, `NOTION_TOKEN`, Redis (`${{Redis.REDIS_URL}}`) y `NOTION_WEBHOOK_SECRET`. Variables en el servicio **Quantia_API** (dominio `quantiaapi-production…`), no solo en el `api` legacy. Suscripción Notion re-verificada (2026-10-22).

### Added

- **Directorio de usuarios para coordinadores (backlog deuda técnica):** `GET /api/v1/users/directory?q=&page=&pageSize=` para `ADMINISTRADOR` y `COORDINADOR`. Exige término de búsqueda (2–100 caracteres, nombre o e-mail sin distinguir mayúsculas), solo usuarios activos, devuelve únicamente `id`, `fullName`, `email`; `pageSize` máx. 50. Contracts 0.7.0 (`userDirectoryQuerySchema`, `paginatedUserDirectoryResponseSchema`).
- `Retry-After` **legible por el navegador:** todo `429` (throttlers `default`, `auth`, `reports`, `chat-general` y bloqueo progresivo de login) responde con `Retry-After` en segundos; CORS lo publica vía `exposedHeaders`. Constantes `HttpHeader` / `CORS_EXPOSED_HEADERS` en contracts.
- **Chat General del semillero (ENG-171 / ENG-172 / ENG-173):** namespace Socket.io `/general`, presencia Redis, historial paginado por cursor en Postgres, `POST`/`GET /api/v1/chat/general/messages`, flag `CHAT_GENERAL_ENABLED`, contracts 0.6.0. PRs [#41](https://github.com/julianmeoficial/Quantia_API/pull/41), [#42](https://github.com/julianmeoficial/Quantia_API/pull/42), [#43](https://github.com/julianmeoficial/Quantia_API/pull/43). Docs: [`docs/architecture/chat-general.md`](docs/architecture/chat-general.md), [`chat-general-testing.md`](docs/architecture/chat-general-testing.md), [`chat-general-closure.md`](docs/architecture/chat-general-closure.md).
- **Pentesting P0–P6 (ENG-118):** programa local / consola cerrado; evidencia en [`docs/pentesting/`](docs/pentesting/README.md). PRs [#34](https://github.com/julianmeoficial/Quantia_API/pull/34)–[#40](https://github.com/julianmeoficial/Quantia_API/pull/40). Smoke no ofensivo en Railway documentado en P6.
- **Security S1–S6 (ENG-117):** threat model STRIDE ([`docs/security/threat-model.md`](docs/security/threat-model.md), PR [#11](https://github.com/julianmeoficial/Quantia_API/pull/11)); S2 auth hardening ([`auth.md`](docs/architecture/auth.md), [#12](https://github.com/julianmeoficial/Quantia_API/pull/12)); S3 data ([`data-hardening.md`](docs/security/data-hardening.md), [#14](https://github.com/julianmeoficial/Quantia_API/pull/14)); S4 infra ([`infra-hardening.md`](docs/security/infra-hardening.md), [#16](https://github.com/julianmeoficial/Quantia_API/pull/16)); S5 resilience ([`resilience.md`](docs/security/resilience.md), [#17](https://github.com/julianmeoficial/Quantia_API/pull/17)); S6 verification — `audit:ci`, Dependabot, ESLint security, CodeQL SARIF gate, ASVS checklist ([#18](https://github.com/julianmeoficial/Quantia_API/pull/18)).
- **ENG-117 closure checkout:** [`docs/security/eng-117-closure.md`](docs/security/eng-117-closure.md) (acceptance matrix, deferred debt, pentest handoff).

### Changed

- README y docs de estado alineados con Chat General entregado y pentest P0–P6 cerrado (laboratorio local; sin ofensiva contra staging).
- **Fixes_1 / F7 debt:** Session pooler `:5432` es la política staging oficial de `DIRECT_URL` (ENG-156); smoke Notion → `sync_events` `SYNCED` documentado (ENG-159); Railway Config as Code (`railway.toml`) migrado a Infrastructure as Code [`.railway/railway.ts`](.railway/railway.ts) (ENG-158).
- Staging API unificada al servicio Railway `Quantia_API` (deploy desde GitHub `main`): dominio `https://quantiaapi-production.up.railway.app`. Nueva suscripción Notion + `NOTION_WEBHOOK_SECRET` rotado; docs/Bruno actualizados. Servicio `api` (`api-production-18cd…`) queda legacy/deprecar. ENG-157 cerrado.

### Fixed

- **Node.js 22.23.4 (security release 2026-10-21):** el `Dockerfile` deja de usar la etiqueta flotante `node:22-alpine` y fija `node:22.23.4-alpine`. Cualquier 22.x anterior a v22.23.4 queda afectada por fallas altas del [aviso oficial](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): escritura fuera de límites en el decodificador Brotli (CVE-2026-111497, RCE), bypass de validación de hostname en certificados TLS (CVE-2026-106069 / CVE-2026-106072; toca salidas a Supabase, Notion y Redis) y `dns.resolve` con NUL (CVE-2026-105482). El pin evita que Railway vuelva a construir sobre un patch level vulnerable mientras la etiqueta `22` no se actualiza. Docs: [`docs/architecture/docker.md`](docs/architecture/docker.md), [`docs/security/infra-hardening.md`](docs/security/infra-hardening.md).
- **QX-P5-001** (Medium): race en refresh concurrente; rotación atómica con `tryConsumeRefresh` (`updateMany` where `revokedAt IS NULL`). Retest PASS (consola + e2e). Evidencia: [`docs/pentesting/evidence/p6/QX-P5-001-retest.md`](docs/pentesting/evidence/p6/QX-P5-001-retest.md).

### Added

- F7 stabilisation / Security handoff (ENG-126): committed `openapi/openapi.json` + `npm run openapi:export`, Bruno collection (`bruno/`), expanded seed (budgets/docs/reports/audit), RLS migration (`ENABLE ROW LEVEL SECURITY` + revoke `anon`/`authenticated`), inventory + handoff docs. Functional freeze after merge.
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

[Unreleased]: https://github.com/julianmeoficial/Quantia_API/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/julianmeoficial/Quantia_API/releases/tag/v0.1.0
