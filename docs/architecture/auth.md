# Quantia API — Authentication (F1 + S2)

Covers **RF-01**, **RF-02**, **RF-03** ([ENG-119](https://linear.app/brevku/issue/ENG-119)) and security hardening **S2** ([ENG-128](https://linear.app/brevku/issue/ENG-128)).

## Roles

| Role | Code | Typical access |
|------|------|----------------|
| Investigador | `INVESTIGADOR` | Own profile (`GET /users/me`); project membership scoped |
| Coordinador | `COORDINADOR` | Portfolio create/manage; budget writes |
| Administrador | `ADMINISTRADOR` | User CRUD + cross-project |

Roles are seeded in migration `20260917000000_auth_users_roles`.

## Token model

```mermaid
sequenceDiagram
  participant Client
  participant Auth as AuthController
  participant Svc as AuthService
  participant DB as Postgres

  Client->>Auth: POST /auth/login
  Auth->>Svc: lockout check + argon2id verify
  Svc->>DB: insert refresh_tokens hash + familyId
  Auth-->>Client: accessToken + refreshToken

  Client->>Auth: POST /auth/refresh
  Auth->>Svc: validate hash
  alt token already revoked
    Svc->>DB: revoke entire family
    Auth-->>Client: 401
  else valid
    Svc->>DB: rotate refresh same familyId
    Auth-->>Client: new tokens
  end

  Client->>Auth: POST /auth/logout
  Svc->>DB: set revokedAt
```

- **Access JWT** (HS256 only): Bearer header, TTL `JWT_ACCESS_TTL` (default `15m`)
  - Payload body: `{ sub, email, roles }`
  - Standard claims: `iss` (`JWT_ISSUER`, default `quantia-api`), `aud` (`JWT_AUDIENCE`, default `quantia-clients`), `exp`
  - Verification rejects `alg: none`, wrong algorithm, wrong `iss`/`aud`, expired tokens
- **Refresh**: opaque random string; only **SHA-256 hash** stored; rotation on each refresh; reuse of a revoked token revokes the **family**
- **WebSocket**: same access JWT via `handshake.auth.token`; membership checked before `socket.join()`. On `/general` the socket is closed at JWT `exp` + `CHAT_GENERAL_TOKEN_GRACE_SECONDS` unless the client sends `chat.general.reautenticar { token }` after refreshing

## Login hardening (S2)

- Generic `Invalid credentials` for unknown user, inactive user, and bad password
- Dummy argon2 verify on missing/inactive user (timing parity)
- Progressive lockout in Redis keyed by normalized email + client IP:
  - 5 failures → 60s lock
  - 10 → 5 min
  - 20 → 15 min
  - Locked requests → **429** `Too many attempts`
- Successful login clears fail/lock keys
- Passwords hashed with **argon2id** (`memoryCost` 65536, `timeCost` 3)

Global HTTP rate limiting remains **S5**.

## Object-level authorization

- Every `:projectId` path goes through `ProjectAccessService.assertCanAccessProject`
- Budget writes: service `assertCanManageProject` + controller `@Roles(ADMINISTRADOR, COORDINADOR)`
- Task update/delete: assignee **or** project manager
- Progress update/delete: author **or** project manager

## Endpoints (`/api/v1`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/login` | `@Public()` |
| POST | `/auth/refresh` | `@Public()` |
| POST | `/auth/logout` | `@Public()` (body has refresh) |
| GET | `/users/me` | JWT (incluye `avatar` y `avatarRequired`) |
| GET | `/users/avatars` | JWT (catálogo de 5 avatares predefinidos) |
| PATCH | `/users/me/avatar` | JWT (`{ avatar }`; sin subida de fotos) |
| GET/POST/PATCH/DELETE | `/users` | JWT + `@Roles(ADMINISTRADOR)` |

Responses never include `passwordHash`.

## Guards

Global (deny by default):

1. `JwtAuthGuard` — skip only with `@Public()`
2. `RolesGuard` — skip if no `@Roles()`; otherwise require intersection with user roles

`GET /health` is `@Public()`.

## Modules

- [`src/auth/`](../../src/auth/) — login / refresh / logout, `TokensService`, `JwtStrategy`, `LoginLockoutService`
- [`src/users/`](../../src/users/) — profile + admin CRUD
- [`src/common/`](../../src/common/) — decorators, guards, `ProjectAccessService`, `HttpExceptionFilter`
- [`packages/contracts`](../../packages/contracts/) — shared Zod/types for frontend

## Env

See [`.env.example`](../../.env.example):

| Variable | Notes |
|----------|--------|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥ 32 chars |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | defaults `15m` / `7d` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | defaults `quantia-api` / `quantia-clients` |

## Local demo users

```bash
DATABASE_URL=postgresql://quantia:quantia@localhost:5433/quantia \
DIRECT_URL=postgresql://quantia:quantia@localhost:5433/quantia \
  npm run prisma:seed
```

| Email | Password | Role |
|-------|----------|------|
| `admin@quantia.local` | `AdminPass1!` | ADMINISTRADOR |
| `coord@quantia.local` | `CoordPass1!` | COORDINADOR |
| `researcher@quantia.local` | `ResearchPass1!` | INVESTIGADOR |

Swagger (Compose with `NODE_ENV=development`): http://localhost:3000/api/docs
