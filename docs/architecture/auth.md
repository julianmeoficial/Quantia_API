# Quantia API — Authentication (F1)

Covers **RF-01**, **RF-02**, **RF-03** ([ENG-119](https://linear.app/brevku/issue/ENG-119)).

## Roles

| Role | Code | Typical access |
|------|------|----------------|
| Investigador | `INVESTIGADOR` | Own profile (`GET /users/me`) |
| Coordinador | `COORDINADOR` | Own profile (domain access in F2+) |
| Administrador | `ADMINISTRADOR` | User CRUD + own profile |

Roles are seeded in migration `20260917000000_auth_users_roles`.

## Token model

```mermaid
sequenceDiagram
  participant Client
  participant Auth as AuthController
  participant Svc as AuthService
  participant DB as Postgres

  Client->>Auth: POST /auth/login
  Auth->>Svc: verify argon2
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

- **Access JWT**: Bearer header, TTL `JWT_ACCESS_TTL` (default `15m`), payload `{ sub, email, roles }`
- **Refresh**: opaque random string; only **SHA-256 hash** stored; rotation on each refresh; reuse of a revoked token revokes the **family**

## Endpoints (`/api/v1`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/login` | `@Public()` |
| POST | `/auth/refresh` | `@Public()` |
| POST | `/auth/logout` | `@Public()` (body has refresh) |
| GET | `/users/me` | JWT |
| GET/POST/PATCH/DELETE | `/users` | JWT + `@Roles(ADMINISTRADOR)` |

Passwords are hashed with **argon2**. Responses never include `passwordHash`.

## Guards

Global (deny by default):

1. `JwtAuthGuard` — skip only with `@Public()`
2. `RolesGuard` — skip if no `@Roles()`; otherwise require intersection with user roles

`GET /health` is `@Public()`.

## Modules

- [`src/auth/`](../../src/auth/) — login / refresh / logout, `TokensService`, `JwtStrategy`
- [`src/users/`](../../src/users/) — profile + admin CRUD
- [`src/common/`](../../src/common/) — decorators, guards, `HttpExceptionFilter`
- [`packages/contracts`](../../packages/contracts/) — shared Zod/types for frontend

## Env

See [`.env.example`](../../.env.example): `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL` (secrets ≥ 32 chars).

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
