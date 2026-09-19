# Notion sync — F3 / ENG-120

Bidirectional sync between the Quantia Notion sandbox and Postgres.
Postgres remains the **system of record**; Notion is the collaborative capture layer.

## Components

| Piece | Role |
|-------|------|
| [`NotionClient`](../../src/notion/notion.client.ts) | Only wrapper around `@notionhq/client`; 3 req/s limiter; exponential retry on 429 |
| [`NotionMapper`](../../src/notion/notion.mapper.ts) | Sandbox property ↔ Prisma enum mapping |
| [`NotionWebhookController`](../../src/notion/notion-webhook.controller.ts) | `POST /api/v1/webhooks/notion` (`@Public`): verification_token, HMAC signature, enqueue |
| [`NotionSyncEnqueueService`](../../src/notion/notion-sync-enqueue.service.ts) | Creates `sync_events` + BullMQ jobs |
| [`NotionSyncProcessor`](../../src/notion/notion-sync.processor.ts) | Worker-only consumer for `sync:notion-to-db` / `sync:db-to-notion` |
| [`sync_events`](../../prisma/schema.prisma) | Audit of attempts, duplicates, failures |

## Jobs

- `sync:notion-to-db` — webhook-driven upsert; skip when `last_edited_time <= synced_at`
- `sync:db-to-notion` — after Users/Projects/Tasks/Progress create|update
- Attempts: `NOTION_SYNC_MAX_ATTEMPTS` (default 5), exponential backoff; then `sync_status`/`sync_events` → `FAILED` + structured error log

## Scope

Synced: Users, Projects, Tasks, Progress.  
**Not** synced: Documents/Storage (F5), budget.

## Sandbox IDs

See [`.env.example`](../../.env.example). Root page:
`3df8b2d8-659c-808d-890f-d25b0213aacd`.

API version: `2025-09-03` (data source queries).

## NO OLVIDAR — URL del webhook (túnel local → Railway)

Notion **no** puede llamar a `localhost`. La suscripción del webhook necesita una URL **pública HTTPS**.

| Etapa | Dónde corre la API | URL a pegar en Notion |
|-------|--------------------|------------------------|
| Dev local (opcional) | Host + túnel cloudflared | `https://<túnel>/api/v1/webhooks/notion` |
| **Staging (actual)** | Railway | `https://api-production-18cd.up.railway.app/api/v1/webhooks/notion` |
| Production (Hobby, octubre) | Railway prod | `https://<api-prod>.up.railway.app/api/v1/webhooks/notion` |

> **Staging es el destino real.** No dejes una suscripción apuntando a un túnel
> cloudflared: los eventos dejan de llegar en silencio.
> Guía Railway: [`deploy.md`](./deploy.md) · smoke: [`deploy-validation.md`](./deploy-validation.md).

**Checklist al crear / cambiar suscripción:**

1. URL pública HTTPS de la API (arriba).
2. Notion envía un POST único con `verification_token` (sin firma). La API lo
   loguea y responde 200. Pégalo en el diálogo **Verify** de Notion.
3. Ese **mismo** `verification_token` es la clave HMAC de todos los eventos
   posteriores (`X-Notion-Signature`). Guardarlo como `NOTION_WEBHOOK_SECRET`
   en `.env` y en Railway (api + worker). **No** es el Access Token de la
   integración (`NOTION_TOKEN` / `ntn_…`). Notion **no** muestra un “Webhook
   secret” aparte tras verificar.
4. Redeploy api + worker tras setear el secret.
5. Borrar cualquier suscripción/túnel viejo.
6. Smoke: editar en sandbox → fila `sync_events` `SYNCED`.

### Túnel local (solo si no hay staging)

Prerrequisitos: Postgres + Redis, API en `:3000`, worker.

```bash
docker run --rm cloudflare/cloudflared:latest \
  tunnel --url http://host.docker.internal:3000
```

URL de ejemplo: `https://<subdominio>.trycloudflare.com/api/v1/webhooks/notion`.

### Secrets

1. `NOTION_TOKEN` — Internal Integration Token (REST / sync). **No** firmar webhooks.
2. `NOTION_WEBHOOK_SECRET` — el `verification_token` del handshake (`secret_…`).
   Si se pierde, hay que **borrar y recrear** la suscripción (Notion no lo reexpone).

## Security

- Integration token and webhook secret only via env; never in responses or browser.
- No Notion calls inside HTTP handlers except the webhook (which only enqueues).
- `notion_page_id` is never returned in domain response DTOs.
