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

## Railway staging — checklist smoke

Prerrequisito: `CHAT_GENERAL_ENABLED=true` en el servicio API; migración aplicada.

1. `GET /api/v1/health` → 200
2. `POST /api/v1/auth/login` → access token
3. `POST /api/v1/chat/general/messages` + `GET …/messages?limit=10`
4. Dos clientes `wss://<host>/general` con `auth.token` y `transports: ['websocket']`: presencia, mensaje fanout, reconexión
5. Tras redeploy: reconnect WS + presencia reconstruida (claves efímeras)

Plantilla de evidencia: [`evidence/chat-general-eng-172-staging.md`](./evidence/chat-general-eng-172-staging.md).
