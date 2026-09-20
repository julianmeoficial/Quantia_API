# F5 — Presupuesto, documentos y reportes (ENG-124)

Presupuesto y ejecución financiera viven **solo en Postgres**. Notion no
participa: no hay `notion_page_id` en modelos de budget ni sync de documentos.

Documentos y reportes usan **Supabase Storage** (buckets privados) con URLs
firmadas de corta vida. PDF/Excel se generan en el **worker BullMQ**, nunca en
el hilo HTTP.

## Modelos (Postgres)

| Modelo | Rol |
|--------|-----|
| `Budget` | 1:1 con `Project`; `totalAmount` Decimal(14,2), moneda `COP`, umbral de alerta |
| `BudgetItem` | Líneas planificadas (categoría + monto) |
| `BudgetExecution` | Movimientos (PAYMENT / COMMITMENT / ADJUSTMENT) |
| `Document` | Metadatos; binario solo en Storage (`storageKey` interno) |
| `Report` | `QUEUED` → `PROCESSING` → `READY` \| `FAILED`; `kind` + storage |
| `AuditLog` | Insert-only: actor, acción, recurso, resultado, IP, UA, metadata |

## Rutas (`/api/v1`)

| Módulo | Endpoints |
|--------|-----------|
| Budget | `GET/POST/PATCH projects/:projectId/budget`; `GET/POST .../budget/executions` |
| Documents | `POST/GET projects/:projectId/documents`; `GET .../:id/download`; `DELETE .../:id` |
| Reports | `POST projects/:projectId/reports` → **202** `{ reportId }`; `GET .../reports/:id` |

AuthZ vía `ProjectAccessService`: investigador lee (y puede subir docs); solo
coord/admin escribe presupuesto y borra documentos / lanza reportes.

## Storage

- Buckets privados: `quantia-documents`, `quantia-reports` (configurables).
- Upload: rename UUID, max **25 MiB** (multer `limits.fileSize` + MimeGuard), MIME por **magic bytes** (PDF, PNG, JPEG, XLSX); `originalName` sanitizado (`basename`, sin path traversal).
- Download: signed URL TTL **300s**. Nunca se exponen `storageKey` ni la service role.
- Detalle S3: [`docs/security/data-hardening.md`](../security/data-hardening.md).
- En CI/tests: `StorageService` se mockea / `InMemoryStorageService` — no se llama a Supabase real.

Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_STORAGE_BUCKET_*`, `STORAGE_SIGNED_URL_TTL_SECONDS`,
`STORAGE_MAX_UPLOAD_BYTES`, `STORAGE_ALLOWED_MIME`.

## Alerta realtime (F4)

Tras crear una ejecución, si `executedPercent < alertThresholdPercent`
(subejecución), el API emite `presupuesto.ejecucion-baja` a la room del
proyecto con `notifyUserId` = `coordinatorId`.

## Reportes async

1. `POST .../reports` crea fila `QUEUED`, encola job BullMQ `reports`, responde **202**.
2. Worker (`ReportsProcessor`): genera PDF (`pdfkit`) o Excel (`exceljs`), sube al
   bucket de reportes, marca `READY` (o `FAILED`).
3. Cliente hace polling de `GET .../reports/:id`; si `READY`, la respuesta incluye
   URL firmada de descarga.

## Audit

`AuditInterceptor` global registra mutaciones cuyo path incluye `/budget`,
`/documents` o `/reports` (`SUCCESS` / `DENIED` / `ERROR`). Tabla insert-only.

## Smoke con Supabase real

Unit + e2e usan mock. Para smoke de buckets reales hace falta entregar
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (nunca en git) y crear los buckets
privados en el proyecto Supabase.
