# Domain model — Projects, Tasks, Progress (F2 / ENG-122)

Postgres is the system of record for research workflow. Notion mirror columns
(`notion_page_id`, `last_edited_time`, `synced_at`, `sync_status`) exist for F3
but have **no sync logic** in F2.

## Entities

| Entity | Table | Purpose |
|--------|-------|---------|
| **Project** | `projects` | Research space (RF-05). Owns coordinator, members, tasks, progress. |
| **ProjectMember** | `project_members` | Many-to-many user ↔ project (researchers). |
| **Task** | `tasks` | Work items nested under a project. |
| **Progress** | `progress_entries` | Advances / bitácoras (RF-07) with `evidenceLinks` (RF-08, links only — Storage is F5). |

### Status enums

- `ProjectStatus`: `FORMULATION` · `ACTIVE` · `DELAYED` · `COMPLETED` · `CANCELLED`
- `TaskStatus`: `TODO` · `IN_PROGRESS` · `BLOCKED` · `DONE`
- `TaskPriority`: `LOW` · `MEDIUM` · `HIGH`
- `SyncStatus`: `PENDING` · `SYNCED` · `FAILED` (default `PENDING`)

## Membership rules (enforced in services)

Never trust `projectId` from the client without a service-level check.

| Role | List / get projects | Create project | Update / delete / members | Tasks & progress |
|------|---------------------|----------------|---------------------------|------------------|
| **ADMINISTRADOR** | All | Yes (may set any `coordinatorId`) | Yes | Yes on any project |
| **COORDINADOR** | Where `coordinatorId = me` **OR** member | Yes (self as coordinator) | Only if coordinator of that project | If can access project |
| **INVESTIGADOR** | Where member | No (403) | No | If member of project |

Helpers live in [`ProjectAccessService`](../../src/common/project-access.service.ts):

- `accessibleProjectWhere(user)` — Prisma filter for list
- `assertCanAccessProject(user, projectId)` — read/write tasks & progress
- `assertCanManageProject(user, projectId)` — project update/delete/members
- `assertUserIsProjectMember(projectId, userId)` — assignee must be coordinator or member

## REST surface (`/api/v1`)

All routes require JWT (global `JwtAuthGuard`). Create project additionally requires
`ADMINISTRADOR` or `COORDINADOR` via `@Roles`.

| Resource | Endpoints |
|----------|-----------|
| Projects | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/members`, `DELETE /projects/:id/members/:userId` |
| Tasks | CRUD under `/projects/:projectId/tasks` |
| Progress | CRUD under `/projects/:projectId/progress` (`authorId` always from JWT on create) |

### Query filters / sort

| Resource | Filters | `sortBy` |
|----------|---------|----------|
| Projects | `status`, `q` (title) | `createdAt` · `title` · `status` |
| Tasks | `status`, `priority`, `assigneeId` | `dueDate` · `priority` · `createdAt` |
| Progress | `taskId`, `authorId` | `recordedAt` · `createdAt` |

Pagination: `page` (default 1), `pageSize` (default 20, max 100), `sortOrder` (`asc`|`desc`).

## Contracts

Shared Zod schemas and TypeScript types in `@quantia/contracts`:

- `packages/contracts/src/projects.ts`
- `packages/contracts/src/tasks.ts`
- `packages/contracts/src/progress.ts`
- `packages/contracts/src/pagination.ts` — generic `paginatedResponseSchema`

## Seed demo

After `npm run prisma:seed`:

- Users: admin, coord, researcher A, researcher B
- **Project Alpha** — member A; **Project Beta** — member B (same coordinator)
- Sample tasks and progress entries for BOLA / membership e2e scenarios

## Out of scope (later phases)

- Notion sync (F3), Socket.io (F4), budget / Storage (F5), rate limiting
