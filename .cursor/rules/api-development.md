---
name: api-development
description: Rules for building the Quantia NestJS API across the eight incremental phases F0-F7. Use whenever writing, refactoring or reviewing API modules, migrations, jobs, the Socket.io gateway or the Docker/CI setup.
---

# Quantia API — Development Rules (F0..F7)

## Golden rule
Work phase by phase. Every phase must produce deployable, verifiable software. NEVER
start work belonging to a later phase before the current phase's exit criteria are met.
If a request mixes phases, say so and propose the smallest phase-correct slice.

## Phase map and dependencies
F0 Bootstrap -> F1 Auth -> F2 Core domain -> (F3 Notion sync | F4 Realtime)
-> F5 Budget/documents/reports -> F6 Observability & deploy -> F7 Stabilisation & handoff.

## F0 — Bootstrap
- Strict TypeScript, ESLint + Prettier, module-based structure.
- Global `ConfigModule` with schema validation: the app MUST refuse to boot when a
  required env var is missing. No silent defaults for secrets or connection strings.
- URI versioning enabled; every route under `/api/v1`.
- Multi-stage Dockerfile: base -> deps (`npm ci` with lockfile) -> build
  (`nest build` + `npm prune --omit=dev`) -> runner (`dist/`, prod `node_modules`,
  `USER node`, HEALTHCHECK on `/api/v1/health`, `CMD ["node", "dist/main.js"]`).
- `.dockerignore` must exclude `node_modules`, `.git`, `dist`, `.env*`, `coverage`.
- `docker-compose.yml` with postgres, redis, api, worker and an ephemeral `migrate`
  service; healthchecks plus `depends_on: { condition: service_healthy }` and
  `service_completed_successfully` for migrate.
- `GET /api/v1/health` must actually check Postgres and Redis, not return a constant.
- CI (GitHub Actions): lint, typecheck, tests and `docker build` on every PR.
EXIT: `docker compose up` -> 200 on `/api/v1/health`, CI green.

## F1 — Auth, users and roles (RF-01, RF-02, RF-03)
- Tables: `users`, `roles`, `user_roles`, `refresh_tokens`. Roles: Investigador,
  Coordinador, Administrador.
- argon2 hashing (or bcrypt cost >= 12). Passwords never logged, never returned.
- Access JWT 15 min; rotating refresh token persisted and revocable. Reusing a
  consumed refresh token revokes the whole family.
- Global `JwtAuthGuard`; `RolesGuard` with `@Roles()`; `@Public()` is the ONLY way to
  expose an endpoint.
- Endpoints: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `GET /users/me`, user CRUD restricted to Administrador.
- Logout must revoke the refresh token server-side, not just clear the client.
EXIT: e2e tests proving 401 without token, 403 with insufficient role, 200 with the right role.

## F2 — Core domain: projects, tasks, progress (RF-05, RF-07, RF-08, RF-15)
- Modules `ProjectsModule`, `TasksModule`, `ProgressModule`, each with validated DTOs.
- Membership rules implemented IN THE SERVICE, never in the controller:
  Researcher -> only projects where they are a member; Coordinator -> their portfolio;
  Administrator -> everything.
- Mandatory pagination with a max `pageSize`, plus filters and sorting.
- Global `HttpExceptionFilter` with one JSON error shape, no internal traces.
EXIT: full CRUD for the three domains, >= 70% service coverage, OpenAPI generated.

## F3 — Notion integration (RF-05..RF-08, RNF-10)
- Wrap everything in a `NotionClient`: integration token from env, hard limiter at
  3 req/s, exponential retry on 429. No direct `@notionhq/client` calls from services.
- `POST /webhooks/notion`: handle the initial `verification_token`, validate the
  signature of every event, reply 200 in under 3 s, then enqueue the real work.
- Jobs `sync:notion-to-db` and `sync:db-to-notion`; compare `last_edited_time` against
  `synced_at` to discard duplicate events (idempotency is mandatory).
- Failure policy: persist in Postgres with `sync_status = pending`, retry up to 5
  times with backoff; then `failed` + admin alert. The user must NEVER lose data.
EXIT: a Notion edit reaches Postgres and vice-versa, with evidence of the controlled failure path.

## F4 — Realtime with Socket.io (RF-12, RF-13)
- One gateway, namespaces `/projects` and `/notifications`, rooms per `projectId`.
- Authenticated handshake: same JWT in `handshake.auth.token`; invalid token ->
  immediate disconnect, before any `socket.join()`.
- Verify room membership before joining. Contract events only:
  `tarea.actualizada`, `avance.registrado`, `proyecto.retrasado`,
  `presupuesto.ejecucion-baja`.
- Redis adapter wired from day one, even with a single replica.
EXIT: two clients in the same room receive a worker-emitted event; a client without JWT is rejected.

## F5 — Budget, documents and reports (RF-09, RF-18)
- Budget and financial execution: Postgres only, role-restricted at service level.
- Files in private Supabase Storage; UUID-renamed; MIME allowlist verified by content,
  not extension; size limit; download exclusively via short-lived signed URL.
- PDF/Excel generation in the worker; the user gets a signed URL or a notification.
- `audit_log` populated by an interceptor: actor, action, resource, result, IP, timestamp.
  Insert-only from the application.
EXIT: async report generation without blocking the API; every sensitive write audited.

## F6 — Observability and deploy
- `api` and `worker` from the same image with different commands; managed Redis.
- Separate `staging` and `production`: different databases, secrets and Redis. Never mix data.
- Structured JSON logs with `requestId` (7-day retention on Hobby).
- Images tagged by commit SHA; failed healthcheck -> rollback to the previous image.
- Migrations run with `DIRECT_URL` before traffic switches.
EXIT: the Vercel frontend consumes the API over HTTPS and WSS with CORS solved for production and preview URLs.

## F7 — Stabilisation and handoff to Security
- Published OpenAPI/Swagger collection + Postman/Bruno collection.
- Realistic seed data in `staging` covering the three roles, plus two researchers on
  different projects (needed for BOLA testing).
- Inventory of endpoints, WebSocket events and jobs — direct input for threat modelling.
- Technical debt logged in Linear, classified blocking / non-blocking.
EXIT: FUNCTIONAL FREEZE. From here on, only security fixes and defect fixes.

## Anti-patterns to refuse
- Business logic inside controllers or inside the gateway.
- Any Notion or e-mail call inside a request handler.
- New endpoints without DTOs, without OpenAPI decorators or without tests.
- Endpoints returning ORM entities directly.
- Lists without pagination caps.
- `any` types, `@ts-ignore`, or disabling strict mode to unblock a build.
- Adding features after F7 freeze.