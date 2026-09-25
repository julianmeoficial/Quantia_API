# ENG-172 — Evidencia Railway staging (Chat General)

Fecha: _pendiente de ejecución post-merge / con URL staging_

| Paso | Comando / acción | Resultado | Notas |
|------|------------------|-----------|-------|
| Health | `GET https://<host>/api/v1/health` | | |
| Login | `POST /api/v1/auth/login` | | |
| Create message | `POST /api/v1/chat/general/messages` | | |
| History | `GET /api/v1/chat/general/messages?limit=10` | | |
| WS presencia | 2 clientes `/general` | | `transports: ['websocket']` |
| Fanout | POST desde A, evento en B | | |
| Reconnect | cerrar/reabrir socket | | |
| Post-redeploy | smoke breve tras deploy | | |

Env confirmado:

- [ ] `CHAT_GENERAL_ENABLED=true`
- [ ] Migración `20260925200000_chat_general_messages` aplicada
- [ ] `REDIS_URL` apunta al Redis managed del proyecto

Rollback verificado (opcional): `CHAT_GENERAL_ENABLED=false` → REST 404 + WS reject.
