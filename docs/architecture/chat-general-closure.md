# Chat General del semillero — Cierre de fase (ENG-173)

| Field | Value |
|-------|--------|
| Milestone | Quantia Chat General del Semillero (fase 9) |
| Linear | [ENG-171](https://linear.app/brevku/issue/ENG-171) (impl) · [ENG-172](https://linear.app/brevku/issue/ENG-172) (pruebas) · [ENG-173](https://linear.app/brevku/issue/ENG-173) (este cierre) |
| Merged PRs | [#41](https://github.com/julianmeoficial/Quantia_API/pull/41) · [#42](https://github.com/julianmeoficial/Quantia_API/pull/42) |
| Scope | **API only** — canal General autenticado, aditivo sobre F4 |
| Auth product | Registro de usuarios **solo Admin** (`POST /users`); sin self-signup |
| Status | Docs + AC 1–9 **Met** (local/CI). AC-10 Railway **Pending ops** |

Docs técnicos: [`chat-general.md`](./chat-general.md) · Pruebas: [`chat-general-testing.md`](./chat-general-testing.md) · Smoke staging: [`evidence/chat-general-eng-172-staging.md`](./evidence/chat-general-eng-172-staging.md)

---

## 1. Documentación técnica (§5 Notion) — checklist

| # | Entregable | Estado | Dónde |
|---|------------|--------|-------|
| 1 | Decisión namespace `/general` + room `general` y tradeoffs vs `/projects` | Done | [`chat-general.md`](./chat-general.md)#decisiones-de-arquitectura |
| 2 | Diagrama `RealtimeEmitter` → Redis → `RealtimeBridge` → room | Done | [`chat-general.md`](./chat-general.md)#flujo-de-datos |
| 3 | Contratos de eventos y payloads | Done | [`chat-general.md`](./chat-general.md)#eventos-de-contrato · `packages/contracts/src/chat-general.ts` |
| 4 | Endpoints REST con ejemplos | Done | [`chat-general.md`](./chat-general.md)#rest-apiv1 |
| 5 | Esquema Prisma `GeneralChatMessage`, migración e índices | Done | [`chat-general.md`](./chat-general.md)#persistencia-prisma |
| 6 | Modelo de presencia Redis (claves, TTL, heartbeat, reconcile) | Done | [`chat-general.md`](./chat-general.md)#presencia-en-redis-no-memoria-local |
| 7 | Variables `CHAT_GENERAL_*`, `REDIS_URL`, `DATABASE_URL`, `DIRECT_URL` | Done | [`chat-general.md`](./chat-general.md)#variables-de-entorno |
| 8 | Despliegue local Docker + Railway staging | Done | [`chat-general.md`](./chat-general.md)#despliegue-local-docker · `#railway-staging` |
| 9 | Observabilidad, pruebas, rollback y limitaciones | Done | [`chat-general.md`](./chat-general.md)#observabilidad-rollback-y-limitaciones · [`chat-general-testing.md`](./chat-general-testing.md) |

---

## 2. Criterios de aceptación (pasa / no pasa)

| # | Criterio | Status | Evidencia |
|---|----------|--------|-----------|
| 1 | Conexión sin JWT o con JWT inválido rechazada | **Met** | `test/realtime.e2e-spec.ts` — rejects without / invalid JWT on `/general` |
| 2 | El cliente recibe la lista de personas en línea al entrar | **Met** | `realtime.e2e` + `chat-general-multi-instance.e2e` — `chat.general.presencia` |
| 3 | Dos pestañas del mismo usuario = una sola presencia | **Met** | `realtime.e2e` dual-tab; unit 0→1 en `chat-general-presence.service.spec.ts` |
| 4 | Desconexión emitida solo al cerrar la última conexión | **Met** | `realtime.e2e` dual-tab; unit last-leave |
| 5 | Caída abrupta corregida por TTL/reconciliación | **Met** | unit `reconcile leaves orphan sockets` / lock skip |
| 6 | Mensaje emitido solo después de persistirse | **Met** | unit service orden `persist` → `emit` |
| 7 | Historial por cursor sin duplicados ni omisiones | **Met** | `chat-general.e2e` pagination |
| 8 | Dos instancias de la API comparten presencia y eventos vía Redis | **Met** | `chat-general-multi-instance.e2e-spec.ts` |
| 9 | Namespaces y eventos existentes sin cambios de comportamiento | **Met** | `realtime.e2e` `/projects` room + `/notifications` connect |
| 10 | Railway staging: WS persistente, reconexión Redis, redeploy y recuperación | **Pending ops** | Procedimiento en [`evidence/chat-general-eng-172-staging.md`](./evidence/chat-general-eng-172-staging.md); rellenar tras smoke con URL |

Matriz detallada de comandos y casos adicionales: [`chat-general-testing.md`](./chat-general-testing.md).

---

## 3. Criterio de salida

| Ítem | Estado |
|------|--------|
| Chat General autenticado y aditivo (no reemplaza `/projects` ni `/notifications`) | **Confirmado** (código + contratos + e2e) |
| Presencia consistente en Redis (multi-socket / multi-réplica en lab) | **Confirmado** (ENG-172) |
| Historial paginado persistente en Postgres | **Confirmado** (ENG-171 + ENG-172) |
| Contratos compartidos `@quantia/contracts` (`chat.general.*`) | **Confirmado** |
| Pruebas unitarias + e2e en CI | **Confirmado** (PR #42 / `main`) |
| Documentación técnica y de cierre | **Confirmado** (este doc + `chat-general.md`) |
| Funcionando en Railway staging (smoke WS + redeploy) | **Pending ops** — checklist listo |
| Actualizar fase 9 en Notion con el resultado | **Acción del owner** (manual) |

---

## 4. Traceability

| Issue | Entrega | PR |
|-------|----------|-----|
| ENG-171 | Implementación API (`/general`, presencia, REST, migración, env) | [#41](https://github.com/julianmeoficial/Quantia_API/pull/41) |
| ENG-172 | Suite de aceptación + matriz de pruebas + CI `CHAT_GENERAL_*` | [#42](https://github.com/julianmeoficial/Quantia_API/pull/42) |
| ENG-173 | Documentación de cierre + AC pasa/no pasa | este documento (PR de docs) |

---

## 5. Notas de producto

- El “canal público” del checklist académico se interpreta aquí como **General autenticado del semillero**, no anónimo.
- Alta de cuentas: solo Administrador; no hay `POST /auth/register` público.
