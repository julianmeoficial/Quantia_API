# Chat General — Testing matrix (ENG-172)

Suite de aceptación del Chat General del semillero. Complementa [`chat-general.md`](./chat-general.md). Cierre de fase y matriz pasa/no pasa: [`chat-general-closure.md`](./chat-general-closure.md) (ENG-173).

## Cómo correr

```bash
# Unit (presencia + service)
npm test -- --watchman=false --testPathPatterns='chat-general|presence'

# E2E (REST, WS, multi-réplica)
docker compose up -d postgres redis
npx prisma migrate deploy
npm run test:e2e -- --watchman=false --testPathPatterns='chat-general|realtime'
```

CI (`.github/workflows/ci.yml`) ejecuta lint, typecheck, unit y e2e con `CHAT_GENERAL_*` en el env del job `verify`.

## Matriz — criterios de aceptación Notion (§4)

| #   | Criterio                                     | Cobertura                                                                 | Resultado esperado                                             |
| --- | -------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Conexión sin JWT o JWT inválido rechazada    | `test/realtime.e2e-spec.ts` — rejects without / invalid JWT on `/general` | disconnect / connect_error                                     |
| 2   | Al entrar recibe `chat.general.presencia`    | `realtime.e2e` presencia + multi-instance                                 | payload `{ users, generatedAt }`                               |
| 3   | Dos pestañas = una presencia pública         | `realtime.e2e` dual-tab + unit 0→1                                        | un solo `PresenceUser` por userId; un solo `usuario-conectado` |
| 4   | `usuario-desconectado` solo al último socket | `realtime.e2e` dual-tab + unit last-leave                                 | evento solo al cerrar el último                                |
| 5   | Caída abrupta corregida por TTL/reconcile    | unit `reconcile leaves orphan sockets`                                    | `leave` + emit desconectado                                    |
| 6   | Mensaje emitido solo tras persistir          | unit service `persist` antes de `emit`                                    | orden `['persist','emit']`                                     |
| 7   | Historial cursor sin dupes/omisiones         | `chat-general.e2e` pagination                                             | union de páginas = ids creados                                 |
| 8   | Dos instancias API comparten Redis           | `chat-general-multi-instance.e2e`                                         | presencia + mensaje cruzados                                   |
| 9   | `/projects` y `/notifications` sin regresión | `realtime.e2e` projects room + notifications connect                      | eventos / connect OK                                           |
| 10  | Railway staging (WS, Redis, redeploy)        | checklist abajo + evidencia                                               | smoke manual post-deploy                                       |

## Pruebas adicionales

| Caso                                        | Cobertura                                         |
| ------------------------------------------- | ------------------------------------------------- |
| Heartbeat renueva TTL                       | unit `heartbeat renews socket TTL`                |
| Orphans al vencer `socket:*`                | unit reconcile orphan                             |
| Lock de reconcile (una réplica)             | unit `skips when lock not acquired`               |
| Deduplicación `(authorId, clientMessageId)` | unit P2002 + e2e idempotent                       |
| Rate limiting POST                          | `chat-general.e2e` rate limit describe → 429      |
| Longitud máxima / vacío                     | e2e 400                                           |
| Payloads sin email/JWT/metadatos            | e2e `assertNoSensitiveFields` + unit author shape |

## Chat General v2 — cobertura

| Caso | Cobertura |
| ---- | --------- |
| Catálogo de 5 avatares; `PATCH /users/me/avatar` rechaza URLs y acepta claves | `chat-general-v2.e2e` avatars |
| `403 AVATAR_REQUIRED` en REST y `error AVATAR_REQUIRED` en socket sin avatar | `chat-general-v2.e2e` + unit service |
| `usuario-actualizado` al cambiar avatar | `chat-general-v2.e2e` + `users.service.spec` |
| Crear → responder → editar → reaccionar (reemplazo y quitar) → borrar, con fanout de cada evento | `chat-general-v2.e2e` lifecycle |
| Solo el autor edita; ventana de edición; mismo texto = no-op | unit service + e2e 403 |
| Admin modera; otros no borran; borrado idempotente; tombstone | unit service + e2e |
| Respuesta a mensaje borrado → `REPLY_TARGET_NOT_FOUND`; cita marcada `deleted` | unit + e2e |
| Reacciones fuera del allowlist → 400; orden estable de chips | e2e + unit |
| Feed de cambios con ediciones y tombstones; requiere `since`/`cursor` | e2e + unit |
| Puntero de lectura monótono, acotado al último `seq`, evento `lectura` | e2e + unit |
| Typing con ack, fanout, `false` explícito, payload inválido | `chat-general-v2.e2e` + `chat-general-presence.service.spec` |
| Reautenticación en banda: mismo usuario OK, otro usuario / basura rechazados | `chat-general-v2.e2e` |
| Replay idempotente re-emite (recupera fanout fallido); replay de borrado no resucita | unit service |
| Normalización de contenido (NFC, control, bidi) | `sanitize-chat-content.spec` |
| Límite de sockets ZSET + heartbeat + liberación en shutdown | `ws-connection-limit.service.spec` |
| `code` opcional en el cuerpo de error | `http-exception.filter.spec` |

```bash
npm run test:e2e -- --watchman=false --testPathPatterns='chat-general-v2'
```

## Railway staging — checklist smoke

Prerrequisito: `CHAT_GENERAL_ENABLED=true` en el servicio API; migración aplicada.

1. `GET /api/v1/health` → 200
2. `POST /api/v1/auth/login` → access token
3. `POST /api/v1/chat/general/messages` + `GET …/messages?limit=10`
4. Dos clientes `wss://<host>/general` con `auth.token` y `transports: ['websocket']`: presencia, mensaje fanout, reconexión
5. Tras redeploy: reconnect WS + presencia reconstruida (claves efímeras)
6. v2: usuario sin avatar → `403 AVATAR_REQUIRED`; tras `PATCH /users/me/avatar` entra; editar, reaccionar y borrar se ven en el otro cliente; typing aparece y desaparece; `PUT /read` mueve los ticks

Plantilla de evidencia: [`evidence/chat-general-eng-172-staging.md`](./evidence/chat-general-eng-172-staging.md).
