# Quantia API — Informe de creación y estado

Documento de referencia del backend Quantia: ¿qué se construyó?, ¿en qué orden?, ¿cómo funciona?, ¿qué se probó?, ¿qué hay desplegado? y ¿dónde profundizar?.

| Campo | Valor |
|-------|--------|
| Producto | Quantia — gestión de proyectos del semillero INNOVATEK'S / GITEMOS |
| Repositorio | [Quantia_API](https://github.com/julianmeoficial/Quantia_API) |
| Versión | `0.1.0` ([CHANGELOG](../CHANGELOG.md), release 2026-10-22) |
| Staging | `https://quantiaapi-production.up.railway.app` (servicio Railway `Quantia_API`) |
| Alcance del repo | Solo backend: NestJS REST + Socket.io + worker BullMQ |
| Congelamiento funcional | Desde F7: seguridad y defectos; Chat General (ENG-171+) como entrega aditiva |

Este informe **sustituye** el borrador local `docs/local/informe-avance-api.md`. Las fuentes técnicas canónicas siguen en `docs/architecture/`, `docs/security/` y `docs/pentesting/`.

---

## 1. Objetivo y alcance

Quantia API es la **única puerta** de la plataforma hacia datos y servicios externos. Expone:

- REST versionado bajo `/api/v1`
- Tiempo real Socket.io en el **mismo** contenedor que la API
- Trabajo lento (sync Notion, PDF/Excel) en un **worker** BullMQ separado

El frontend (Vercel) solo habla HTTPS/WSS con esta API. **No** usa `service_role` de Supabase ni el token de Notion.

| Dominio                      | ¿Qué incluye?                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Auth y usuarios              | Login JWT, refresh rotatorio, CRUD usuarios solo Admin (sin self-signup); directorio de búsqueda para Admin/Coord |
| Proyectos / tareas / avances | Flujo de investigación con autorización por membresía                                                             |
| Notion                       | Capa de captura; espejo en Postgres (`notion_page_id`, `sync_status`, …)                                          |
| Realtime                     | Namespaces `/projects`, `/notifications`, `/general`                                                              |
| Presupuesto                  | Ejecución financiera **solo en Postgres** (nunca en Notion)                                                       |
| Documentos e informes        | Storage privado + URLs firmadas; generación async en worker                                                       |
| Auditoría                    | Logs insert-only                                                                                                  |
| Chat General                 | Canal autenticado del semillero (flag `CHAT_GENERAL_ENABLED`)                                                     |

**Fuera de este informe (pero documentado aparte):** UI Vercel; ofensiva remota contra staging (el pentest P0–P6 fue laboratorio local).

---

## 2. Línea de tiempo e hitos

Basada en [CHANGELOG.md](../CHANGELOG.md) y el roadmap F0–F7 / S1–S6 / P0–P6.

| Fase | Linear | Entrega principal | Evidencia / docs |
|------|--------|-------------------|------------------|
| **F0** | ENG-121 | Bootstrap NestJS, Config Zod, Prisma, Redis, health, Compose, Dockerfile, CI, stub `@quantia/contracts` | [`overview.md`](./architecture/overview.md), [`docker.md`](./architecture/docker.md) |
| **F1** | ENG-119 | Auth: users/roles/refresh, argon2, JWT 15m + refresh rotatorio, guards globales, e2e 401/403/200 | [`auth.md`](./architecture/auth.md) |
| **F2** | ENG-122 | Projects / Tasks / Progress + membership, paginación, seed Alpha/Beta, coverage ≥70% dominio | [`domain.md`](./architecture/domain.md) |
| **F3** | ENG-120 | NotionClient (3 req/s), webhook + HMAC, colas `notion-sync`, espejos + `sync_events` | [`notion.md`](./architecture/notion.md) |
| **F4** | ENG-123 | Socket.io `/projects` + `/notifications`, JWT handshake, Redis adapter + bridge | [`realtime.md`](./architecture/realtime.md) |
| **F5** | ENG-124 | Budget / Documents / Reports / AuditLog, Storage firmado, worker `reports` | [`budget-storage-reports.md`](./architecture/budget-storage-reports.md) |
| **F6** | ENG-125 | Railway staging, logs JSON + `requestId`, CORS allowlist, migrate | [`deploy.md`](./architecture/deploy.md) |
| **F7** | ENG-126 | OpenAPI committed, Bruno, seed ampliado, RLS, inventario, handoff Seguridad, freeze | [`handoff-security.md`](./architecture/handoff-security.md), [`inventory.md`](./architecture/inventory.md) |
| **S1–S6** | ENG-117 | Threat model STRIDE → authz → data → infra → resilience → SAST/SCA/ASVS | [`docs/security/`](./security/README.md), [`eng-117-closure.md`](./security/eng-117-closure.md) |
| **P0–P6** | ENG-118 | Pentest consola local; hallazgo QX-P5-001 (refresh race) remedado y retesteado | [`docs/pentesting/`](./pentesting/README.md) |
| **Chat General** | ENG-171/172/173 | Namespace `/general`, presencia Redis, historial cursor, REST messages | [`chat-general.md`](./architecture/chat-general.md), [`chat-general-closure.md`](./architecture/chat-general-closure.md) |
| **v0.1.0** | — | Release 2026-10-22: contracts 0.7.0 (user directory), `Retry-After` en 429, pin Node `22.23.4-alpine`, rotación secretos post-aviso Railway | [CHANGELOG](../CHANGELOG.md) |

Deuda F7 cerrada en changelog: ENG-156 (Session pooler `DIRECT_URL`), ENG-157 (servicio GitHub `Quantia_API`), ENG-158 (IaC `.railway/railway.ts`), ENG-159 (smoke Notion `SYNCED`).

---

## 3. Sistemas y conexiones

```
Cliente (Vercel / Bruno / FE localhost)
        │  HTTPS + WSS
        ▼
┌──────────────── Railway (staging) ────────────────┐
│  Quantia_API  →  NestJS REST + Socket.io          │
│  worker       →  BullMQ (notion-sync, reports)    │
│  migrate      →  prisma migrate deploy (one-shot) │
│  Redis        →  colas, throttle, fanout WS       │
└───────┬───────────────────┬───────────────────────┘
        │                   │
        ▼                   ▼
  Supabase Postgres    Supabase Storage
  pooler :6543 (app)   buckets privados
  Session :5432 (mig)  URLs firmadas cortas
        ▲
        │ webhooks firmados
     Notion API
```

| Sistema               | Rol                                        | ¿Quién conecta?                              |
| --------------------- | ------------------------------------------ | -------------------------------------------- |
| PostgreSQL (Supabase) | Sistema de registro                        | Solo API + worker vía Prisma                 |
| Redis (Railway)       | Colas BullMQ, rate limit, pub/sub realtime | API + worker                                 |
| Notion                | Captura colaborativa (no presupuesto)      | Solo API (enqueue) + worker (sync)           |
| Supabase Storage      | Archivos de proyecto                       | Solo API/worker (`service_role` en servidor) |
| Vercel (frontend)     | Cliente                                    | HTTPS/WSS a Railway; sin secretos de infra   |

**Invariantes:** nada lento en el hilo HTTP; presupuesto nunca se replica a Notion; un módulo Nest por dominio; contratos en `@quantia/contracts` antes de implementar endpoints.

Detalle de deploy: [`deploy.md`](./architecture/deploy.md) · validación: [`deploy-validation.md`](./architecture/deploy-validation.md).

---

## 4. Arquitectura del código

Un módulo por dominio: **controller → service → repository + DTOs**. Cero lógica de negocio en controllers.

| Ruta | Fase | Función |
|------|------|---------|
| `src/auth/`, `src/users/` | F1 | Login, JWT, roles, CRUD admin, directory |
| `src/projects/`, `src/tasks/`, `src/progress/` | F2 | Flujo de investigación |
| `src/notion/` | F3 | Webhook + client + enqueue sync |
| `src/realtime/` | F4 | Gateways + Redis bridge |
| `src/budget/`, `src/documents/`, `src/reports/`, `src/storage/`, `src/audit/` | F5 | Finanzas, archivos, PDF/Excel, auditoría |
| `src/chat-general/` | ENG-171 | REST + presencia Chat General |
| `packages/contracts/` | transversal | `@quantia/contracts` **0.7.0** (Zod + tipos; workspace, `private`) |
| `prisma/` | transversal | Schema + migraciones versionadas |
| `bruno/`, `openapi/` | F7 | Exploración manual y contrato OpenAPI 3 |

Árbol completo y diagramas Compose/API-worker: [`overview.md`](./architecture/overview.md). Imagen Docker (pin `node:22.23.4-alpine`): [`docker.md`](./architecture/docker.md).

---

## 5. Funcionamiento por capas

### 5.1 Autenticación

| Pieza | Comportamiento |
|-------|----------------|
| Access | JWT HS256 Bearer ~15 min (`sub`, `email`, `roles`, `iss`/`aud`) |
| Refresh | Opaco; hash en DB; rotación; reuso → revoca familia (`tryConsumeRefresh`, fix QX-P5-001) |
| Password | argon2id |
| Guards | Globales `JwtAuthGuard` + `RolesGuard`; `@Public()` solo en login/refresh/logout/health/webhook Notion |
| Alta de usuarios | `POST /api/v1/users` solo `ADMINISTRADOR` |
| WebSocket | Mismo access JWT en `handshake.auth.token` |
| 429 | Header `Retry-After` (segundos), expuesto por CORS |

Roles: `INVESTIGADOR`, `COORDINADOR`, `ADMINISTRADOR`. Detalle: [`auth.md`](./architecture/auth.md).

### 5.2 Dominio y autorización de objeto

Toda query con `id` de proyecto filtra por membresía (o rol Admin). No se confía en `projectId` del body sin comprobar pertenencia. Listados con `page` / `pageSize` y tope duro.

### 5.3 Notion (async)

`POST /api/v1/webhooks/notion` verifica handshake/HMAC y **encola**; el worker aplica `sync:notion-to-db` / `sync:db-to-notion` (límite 3 req/s, backoff en 429). Staging webhook:

`https://quantiaapi-production.up.railway.app/api/v1/webhooks/notion`

(`NOTION_WEBHOOK_SECRET` = `verification_token` del handshake, no el Access Token de la integración.)

### 5.4 Realtime y Chat General

| Namespace | Rooms | Uso |
|-----------|-------|-----|
| `/projects` | por `projectId` (join con membresía) | Eventos de dominio del proyecto |
| `/notifications` | `user:{userId}` | Notificaciones al usuario |
| `/general` | room `general` | Chat del semillero + presencia |

Fanout: `RealtimeEmitter` → canal Redis `quantia:realtime` → bridge en instancias API.

### 5.5 Presupuesto, documentos, reportes

Mutaciones de presupuesto solo Admin/Coord; documentos en buckets privados con URL firmada de corta vida; `POST .../reports` responde 202 y el worker genera PDF/Excel.

---

## 6. Datos de prueba (seed) — locales y staging

Tras `npm run prisma:seed` (también aplicados en la DB de staging usada por Railway):

| Email | Password | Rol | Alcance |
|-------|----------|-----|---------|
| `admin@quantia.local` | `AdminPass1!` | ADMINISTRADOR | Acceso total |
| `coord@quantia.local` | `CoordPass1!` | COORDINADOR | Portafolio Alpha + Beta |
| `researcher@quantia.local` | `ResearchPass1!` | INVESTIGADOR | Solo **Alpha** |
| `researcher-b@quantia.local` | `ResearchPass1!` | INVESTIGADOR | Solo **Beta** (casos BOLA) |

El seed crea además presupuestos F5, una ejecución, metadata de documento, un reporte en cola y `audit_logs` de ejemplo.

**Verificado en staging** (Bruno / curl): `POST /api/v1/auth/login` con admin → 200 + tokens.

```bash
curl -sS -X POST https://quantiaapi-production.up.railway.app/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@quantia.local","password":"AdminPass1!"}'
```

Handoff canónico: [`handoff-security.md`](./architecture/handoff-security.md).

### Conectar un frontend (localhost o Vercel)

1. Base URL: `https://quantiaapi-production.up.railway.app`
2. Login → guardar `accessToken` + `refreshToken`
3. `Authorization: Bearer <accessToken>` en rutas protegidas
4. Incluir el `Origin` del FE en `CORS_ORIGINS` de Railway (p. ej. `http://localhost:3000` o el puerto real; nunca `*`)
5. Swagger UI **no** está montado con `NODE_ENV=production` → usar Bruno u OpenAPI

---

## 7. Superficie HTTP y Socket.io (resumen)

Inventario completo: [`inventory.md`](./architecture/inventory.md). OpenAPI: [`openapi/openapi.json`](../openapi/openapi.json). Bruno: [`bruno/`](../bruno/) (entorno **Staging**).

| Método | Ruta | Auth |
|--------|------|------|
| `GET` | `/api/v1/health` | Público |
| `POST` | `/api/v1/auth/login` \| `refresh` \| `logout` | Público |
| `GET` | `/api/v1/users/me` | JWT |
| `GET` | `/api/v1/users/directory?q=` | JWT + Admin/Coord |
| CRUD | `/api/v1/users` | JWT + Admin |
| CRUD | `/api/v1/projects`, `.../tasks`, `.../progress` | JWT + membresía |
| CRUD | `/api/v1/projects/:id/budget`, `.../documents`, `.../reports` | JWT (+ roles en mutaciones) |
| `POST`/`GET` | `/api/v1/chat/general/messages` | JWT + flag |
| `POST` | `/api/v1/webhooks/notion` | Público + verificación |

---

## 8. ¿Qué se testeó?

### 8.1 Automatizado (CI)

En cada PR / push a `main` ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):

- gitleaks (secretos)
- `npm ci` → `audit:ci` (deps directas high/critical)
- migrate → lint (incl. `eslint-plugin-security`) → typecheck
- unit + e2e (auth, domain, notion, realtime, F5, chat-general, security S2–S5, …)
- `docker build` + Trivy OS (CRITICAL/HIGH)
- CodeQL `security-extended` + gate SARIF

Umbral de cobertura en servicios de dominio: **≥ 70%** (F2+).

### 8.2 Seguridad S1–S6 (ENG-117)

| Fase | Tema |
|------|------|
| S1 | Modelo de amenazas STRIDE |
| S2 | AuthN/AuthZ (BOLA, BFLA, refresh) |
| S3 | Validación, exposición, uploads |
| S4 | Infra, secretos, contenedor, RLS |
| S5 | Rate limit, auditoría, logs |
| S6 | SAST/SCA, Dependabot, ASVS L1–L2 |

Cierre: [`eng-117-closure.md`](./security/eng-117-closure.md).

### 8.3 Pentesting P0–P6 (ENG-118)

Códigohardened ejecutado en **laboratorio local** (Compose). Sin ofensiva contra Railway/Supabase/Notion.

| Fase | Foco |
|------|------|
| P0 | Baseline health, seed, latencias |
| P1 | Superficie, Helmet, CORS, errores |
| P2 | JWT, BOLA/BFLA, lockout, refresh |
| P3 | Inputs, mass assignment, uploads |
| P4 | Socket.io, webhooks Notion |
| P5 | Capacidad, rate limits; hallazgo **QX-P5-001** (race refresh) |
| P6 | Informe, remediación, retest PASS, smoke no ofensivo staging |

Índice: [`pentesting/README.md`](./pentesting/README.md).

### 8.4 Smoke staging

Documentado en [`deploy-validation.md`](./architecture/deploy-validation.md) y handoff:

- `GET /api/v1/health` → 200 (database + redis up)
- `GET /api/v1/users/me` sin token → 401
- Login seed → 200
- Notion sandbox → `sync_events` `SYNCED` (probado 2026-09-20; webhook re-verificado 2026-10-22)

---

## 9. Despliegue actual

| Recurso | Valor |
|---------|--------|
| API | `https://quantiaapi-production.up.railway.app` |
| Deploy | Merge a `main` → build Railway servicio `Quantia_API` |
| Worker | Misma imagen, entry `worker` |
| Migrate | One-shot `prisma migrate deploy` |
| `APP_ENV` | `staging` en trial (nombre de host “production” es del proyecto Railway) |
| Redis | Plugin Railway |
| Postgres / Storage | Supabase |
| IaC | [`.railway/railway.ts`](../.railway/railway.ts) |
| Secretos | Rotados 21–22 oct 2026 tras aviso Railway (DB, JWT, Notion, Redis, webhook) |

Servicio legacy `api` (`api-production-18cd…`): **deprecar**; no usarlo para webhook ni vars.

Producción definitiva (`APP_ENV=production`, proyecto separado) queda diferida a plan Hobby según [`deploy.md`](./architecture/deploy.md).

---

## 10. ¿Cómo correr en local?

```bash
cp .env.example .env
docker compose up --build
curl http://localhost:3000/api/v1/health

# Seed (Postgres publicado en :5433)
DATABASE_URL=postgresql://quantia:quantia@localhost:5433/quantia \
DIRECT_URL=postgresql://quantia:quantia@localhost:5433/quantia \
  npm run prisma:seed
```

Guía detallada: [`development/local-setup.md`](./development/local-setup.md).

---

## 11. Conclusiones

1. La API cumple el rol de backend único hacia Postgres, Redis, Notion y Storage, con REST `/api/v1` y Socket.io en el mismo servicio y trabajo pesado en worker.
2. El camino F0→F7 entregó el producto funcional; S1–S6 y P0–P6 cerraron endurecimiento y verificación ofensiva en lab; Chat General y v0.1.0 completan el estado actual en staging.
3. Auth sin self-signup, membresía por objeto y RLS en Supabase mantienen el perímetro del semillero cerrado.
4. Staging Railway está operativo con seed, health, login Bruno y webhook Notion revalidado tras rotación de secretos.
5. El frontend debe apuntar a la URL de Railway, usar las cuentas seed (o usuarios creados por Admin) y tener su origen en `CORS_ORIGINS`.
6. `@quantia/contracts` vive en este monorepo (`packages/contracts`, privado); no se publica aún a npm — el FE puede consumirlo por path/tarball o tipar vía OpenAPI mientras tanto.

---

## 12. Mapa de documentación

| Tema | Documento |
|------|-----------|
| Este informe | [`docs/API.md`](./API.md) |
| Arquitectura / árbol | [`architecture/overview.md`](./architecture/overview.md) |
| Docker | [`architecture/docker.md`](./architecture/docker.md) |
| Auth | [`architecture/auth.md`](./architecture/auth.md) |
| Dominio | [`architecture/domain.md`](./architecture/domain.md) |
| Notion | [`architecture/notion.md`](./architecture/notion.md) |
| Realtime | [`architecture/realtime.md`](./architecture/realtime.md) |
| Chat General | [`architecture/chat-general.md`](./architecture/chat-general.md) · [closure](./architecture/chat-general-closure.md) |
| Presupuesto / storage / reportes | [`architecture/budget-storage-reports.md`](./architecture/budget-storage-reports.md) |
| Deploy Railway | [`architecture/deploy.md`](./architecture/deploy.md) · [validation](./architecture/deploy-validation.md) |
| Inventario endpoints | [`architecture/inventory.md`](./architecture/inventory.md) |
| Handoff + cuentas seed | [`architecture/handoff-security.md`](./architecture/handoff-security.md) |
| Seguridad S1–S6 | [`security/README.md`](./security/README.md) · [ENG-117 closure](./security/eng-117-closure.md) |
| Pentesting P0–P6 | [`pentesting/README.md`](./pentesting/README.md) |
| Setup local | [`development/local-setup.md`](./development/local-setup.md) |
| Changelog / release | [`CHANGELOG.md`](../CHANGELOG.md) |
| OpenAPI / Bruno | [`openapi/openapi.json`](../openapi/openapi.json) · [`bruno/`](../bruno/) |
| README del repo | [`README.md`](../README.md) |
