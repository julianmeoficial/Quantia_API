# Inventory — F7 handoff to Security (ENG-126)

Threat-modelling input. Keep this file updated when routes, events or jobs change.
After F7: **functional freeze** — only security fixes and defects.

Related: [`handoff-security.md`](./handoff-security.md) · OpenAPI [`openapi/openapi.json`](../../openapi/openapi.json) · Bruno [`bruno/`](../../bruno/).

## REST — `/api/v1`

| Method | Path | Auth | Roles / notes |
|--------|------|------|----------------|
| `GET` | `/health` | `@Public` | Postgres + Redis readiness |
| `POST` | `/auth/login` | `@Public` | |
| `POST` | `/auth/refresh` | `@Public` | Rotating refresh; reuse → family revoke |
| `POST` | `/auth/logout` | `@Public` | Body: `refreshToken` |
| `GET` | `/users/me` | JWT | Any authenticated |
| `GET` | `/users` | JWT | `ADMINISTRADOR` |
| `GET` | `/users/:id` | JWT | `ADMINISTRADOR` |
| `POST` | `/users` | JWT | `ADMINISTRADOR` |
| `PATCH` | `/users/:id` | JWT | `ADMINISTRADOR` |
| `DELETE` | `/users/:id` | JWT | `ADMINISTRADOR` |
| `GET` | `/projects` | JWT | Membership-scoped list |
| `GET` | `/projects/:id` | JWT | Membership |
| `POST` | `/projects` | JWT | `ADMINISTRADOR` \| `COORDINADOR` |
| `PATCH` | `/projects/:id` | JWT | Admin or project coordinator |
| `DELETE` | `/projects/:id` | JWT | Admin or project coordinator |
| `POST` | `/projects/:id/members` | JWT | Admin or coordinator |
| `DELETE` | `/projects/:id/members/:userId` | JWT | Admin or coordinator |
| `GET` | `/projects/:projectId/tasks` | JWT | Project access |
| `GET` | `/projects/:projectId/tasks/:taskId` | JWT | Project access |
| `POST` | `/projects/:projectId/tasks` | JWT | Project access (write rules in service) |
| `PATCH` | `/projects/:projectId/tasks/:taskId` | JWT | Project access |
| `DELETE` | `/projects/:projectId/tasks/:taskId` | JWT | Project access |
| `GET` | `/projects/:projectId/progress` | JWT | Project access |
| `GET` | `/projects/:projectId/progress/:progressId` | JWT | Project access |
| `POST` | `/projects/:projectId/progress` | JWT | Project access |
| `PATCH` | `/projects/:projectId/progress/:progressId` | JWT | Project access |
| `DELETE` | `/projects/:projectId/progress/:progressId` | JWT | Project access |
| `GET` | `/projects/:projectId/budget` | JWT | Project access; financial in Postgres only |
| `POST` | `/projects/:projectId/budget` | JWT | Role-restricted in service |
| `PATCH` | `/projects/:projectId/budget` | JWT | Role-restricted in service |
| `POST` | `/projects/:projectId/budget/executions` | JWT | Role-restricted in service |
| `GET` | `/projects/:projectId/budget/executions` | JWT | Project access |
| `POST` | `/projects/:projectId/documents` | JWT | Multipart upload → private Storage |
| `GET` | `/projects/:projectId/documents` | JWT | Project access |
| `GET` | `/projects/:projectId/documents/:documentId/download` | JWT | Signed URL only |
| `DELETE` | `/projects/:projectId/documents/:documentId` | JWT | Project access |
| `POST` | `/projects/:projectId/reports` | JWT | Enqueues BullMQ; 202 |
| `GET` | `/projects/:projectId/reports/:reportId` | JWT | Status + signed URL when ready |
| `POST` | `/webhooks/notion` | `@Public` | verification_token or HMAC `X-Notion-Signature` |

Swagger UI: only when `NODE_ENV !== 'production'` at `/api/docs`. Staging Railway uses `NODE_ENV=production` → use committed OpenAPI / Bruno.

## WebSocket (Socket.io)

| Namespace | Auth | Rooms | Events (server → client) |
|-----------|------|-------|--------------------------|
| `/projects` | JWT in `handshake.auth.token` | `projectId` (membership checked on `join`) | `tarea.actualizada`, `avance.registrado`, `proyecto.retrasado`, `presupuesto.ejecucion-baja` |
| `/notifications` | JWT | `user:{userId}` | Same contract events (user-targeted) |

Client → server: join project room (`joinProjectRoom` contract). Invalid JWT → disconnect before join. Redis adapter for fan-out.

Contracts: [`packages/contracts/src/realtime.ts`](../../packages/contracts/src/realtime.ts).

## BullMQ jobs

| Queue | Job name | Producer | Consumer | Purpose |
|-------|----------|----------|----------|---------|
| `notion-sync` | `sync:notion-to-db` | API webhook enqueue | Worker | Notion page → Postgres upsert |
| `notion-sync` | `sync:db-to-notion` | Domain services after CRUD | Worker | Postgres → Notion page |
| `reports` | `report:generate` | Reports API | Worker | PDF/Excel → Storage + signed URL |

## Postgres tables (Prisma)

| Table | Domain |
|-------|--------|
| `roles`, `users`, `user_roles`, `refresh_tokens` | Auth |
| `projects`, `project_members`, `tasks`, `progress_entries` | Core |
| `sync_events` | Notion audit |
| `budgets`, `budget_items`, `budget_executions` | Budget (Postgres only) |
| `documents`, `reports` | Storage metadata |
| `audit_logs` | Insert-only audit |

RLS: enabled on all of the above (migration `20260919000000_enable_rls`). `anon` / `authenticated` revoked; Nest via `DATABASE_URL` bypasses RLS (no `FORCE`).

## Supabase Storage buckets

| Bucket | Use |
|--------|-----|
| `quantia-documents` | Project documents (private, signed download) |
| `quantia-reports` | Generated PDF/Excel (private, signed download) |
