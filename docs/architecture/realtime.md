# Realtime — Socket.io (F4 / ENG-123)

Dashboards vivos (RF-12, RF-13). El gateway vive en el **mismo proceso** que la API HTTP; el worker publica eventos vía Redis sin montar Socket.io.

## Namespaces

| Namespace | Uso | Rooms |
|-----------|-----|--------|
| `/projects` | Fanout por proyecto | `projectId` (UUID) tras `join` con membresía |
| `/notifications` | Avisos por usuario | `user:<userId>` (auto-join al conectar) |
| `/general` | Chat General del semillero (ENG-171) | Room fija `CHAT_GENERAL_ROOM` (default `general`), auto-join |

## Auth

- Cliente envía el access JWT en `handshake.auth.token` (mismo secreto F1).
- Token ausente/inválido → `disconnect` inmediato, antes de cualquier `join`. En `/general` se emite antes `error { code, message }` (`UNAUTHORIZED`, `AVATAR_REQUIRED`, `CHAT_DISABLED`, `TOO_MANY_CONNECTIONS`).
- `/general` cierra el socket al vencer el JWT (+ `CHAT_GENERAL_TOKEN_GRACE_SECONDS`) salvo que el cliente envíe `chat.general.reautenticar { token }`.
- Límite por usuario `WS_MAX_CONNECTIONS_PER_USER` (default 10) en ZSET `ws:conn:v2:<userId>` con heartbeat: los sockets de réplicas caídas expiran en ~90 s. La API usa `enableShutdownHooks()` para liberarlos al recibir `SIGTERM`.
- En `/projects`, el cliente emite `join` con `{ projectId }`; el servidor valida con `ProjectAccessService` y responde `joined`.

## Eventos de contrato

Solo estos nombres llegan al frontend (`@quantia/contracts`):

| Evento | Emisor típico |
|--------|----------------|
| `tarea.actualizada` | TasksService create/update; Notion→DB sync de tareas |
| `avance.registrado` | ProgressService create/update; Notion→DB sync de avances |
| `proyecto.retrasado` | ProjectsService update cuando `status === DELAYED`; Notion sync |
| `presupuesto.ejecucion-baja` | Emitter listo; callers de dominio en F5 |
| `chat.general.*` | ChatGeneralService / presencia / UsersService (avatar). Lista completa (10 eventos + `error`, y 2 eventos cliente→servidor con ack) en [`chat-general.md`](./chat-general.md#contratos) |

## Fanout worker → clientes

```text
RealtimeEmitter.publish → Redis channel quantia:realtime
  → RealtimeBridge (API) → namespace.server.to(room).emit(event, payload)
```

El adaptador `@socket.io/redis-adapter` también usa Redis para multi-réplica de la API.

## CORS

`CORS_ORIGINS` (CSV, nunca `*`) aplica a HTTP (`enableCors`) y al servidor Socket.io.

## Local

1. Postgres + Redis (`docker compose up postgres redis -d`).
2. API con `CORS_ORIGINS` y `REDIS_URL=redis://localhost:6379`.
3. Cliente: `io('http://localhost:3000/projects', { auth: { token } })`.

Integración de un cliente (login, refresh, reconexión, Chat General): [`../development/chat-e2e-integration.md`](../development/chat-e2e-integration.md).

E2e: `test/realtime.e2e-spec.ts` — rechazo sin JWT; dos clientes en la misma room reciben un evento emitido por el mismo path del worker (`RealtimeEmitter`).
