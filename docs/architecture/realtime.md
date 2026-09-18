# Realtime — Socket.io (F4 / ENG-123)

Dashboards vivos (RF-12, RF-13). El gateway vive en el **mismo proceso** que la API HTTP; el worker publica eventos vía Redis sin montar Socket.io.

## Namespaces

| Namespace | Uso | Rooms |
|-----------|-----|--------|
| `/projects` | Fanout por proyecto | `projectId` (UUID) tras `join` con membresía |
| `/notifications` | Avisos por usuario | `user:<userId>` (auto-join al conectar) |

## Auth

- Cliente envía el access JWT en `handshake.auth.token` (mismo secreto F1).
- Token ausente/inválido → `disconnect` inmediato, antes de cualquier `join`.
- En `/projects`, el cliente emite `join` con `{ projectId }`; el servidor valida con `ProjectAccessService` y responde `joined`.

## Eventos de contrato

Solo estos nombres llegan al frontend (`@quantia/contracts`):

| Evento | Emisor típico |
|--------|----------------|
| `tarea.actualizada` | TasksService create/update; Notion→DB sync de tareas |
| `avance.registrado` | ProgressService create/update; Notion→DB sync de avances |
| `proyecto.retrasado` | ProjectsService update cuando `status === DELAYED`; Notion sync |
| `presupuesto.ejecucion-baja` | Emitter listo; callers de dominio en F5 |

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

E2e: `test/realtime.e2e-spec.ts` — rechazo sin JWT; dos clientes en la misma room reciben un evento emitido por el mismo path del worker (`RealtimeEmitter`).
