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

Notion **no** puede llamar a `localhost`. La suscripción del webhook necesita una URL **pública HTTPS**. Esa URL **cambia** según el entorno; hay que actualizarla en Notion y **volver a verificar** (y reasignar `NOTION_WEBHOOK_SECRET` si Notion emite uno nuevo).

| Etapa | Dónde corre la API | URL a pegar en Notion (Create subscription) |
|-------|--------------------|-----------------------------------------------|
| Dev / prueba sandbox | Host + túnel (cloudflared / ngrok) | `https://<subdominio-del-túnel>/api/v1/webhooks/notion` |
| Staging / prod (F6) | Railway (u host aprobado) | `https://<host-railway-de-la-api>/api/v1/webhooks/notion` |

**Checklist obligatorio al cambiar de entorno:**

1. Desplegar la API en el nuevo host (o levantar túnel local).
2. En la integración Notion → Webhooks → editar/crear suscripción con la **URL nueva**.
3. Completar el handshake: Notion envía `verification_token` una vez; la API responde `{ "verification_token": "..." }` (también aparece en logs). Pegarlo en el diálogo de Notion.
4. Copiar el **secret de firma** que Notion muestra tras verificar → `NOTION_WEBHOOK_SECRET` en el `.env` / variables de Railway.
5. Reiniciar API (y worker) con el secret nuevo.
6. Probar de nuevo el checklist de salida (crear en Notion → fila `SYNCED`, etc.).

> **No dejes la suscripción apuntando al túnel de desarrollo** después de desplegar en Railway: los eventos dejan de llegar y el sync se “rompe” en silencio.

### Levantar túnel local (dev)

Prerrequisitos: Postgres + Redis (`docker compose up postgres redis -d`), API en `:3000` (`npm run start:dev`), worker (`npm run worker:dev`).

```bash
# Opción A — Cloudflare quick tunnel (sin cuenta; URL efímera)
docker run --rm --network host cloudflare/cloudflared:latest \
  tunnel --url http://127.0.0.1:3000

# En macOS Docker Desktop, si --network host no enruta al host:
docker run --rm cloudflare/cloudflared:latest \
  tunnel --url http://host.docker.internal:3000
```

Cuando cloudflared imprima algo como `https://random-words.trycloudflare.com`, la URL de Notion es:

```text
https://random-words.trycloudflare.com/api/v1/webhooks/notion
```

El handshake de `verification_token` **no** exige firma HMAC; el secret se configura **después** de verificar la suscripción.

### Secrets

1. `NOTION_TOKEN` — token de la integración (Internal), conectada a la página sandbox.
2. `NOTION_WEBHOOK_SECRET` — sale del panel de Webhooks **después** de verificar la suscripción (no inventarlo antes salvo placeholder para arrancar la API).

## Security

- Integration token and webhook secret only via env; never in responses or browser.
- No Notion calls inside HTTP handlers except the webhook (which only enqueues).
- `notion_page_id` is never returned in domain response DTOs.
