# S3 — Data validation, exposure and encryption (ENG-129)

| Field | Value |
|-------|--------|
| Linear | [ENG-129](https://linear.app/brevku/issue/ENG-129/s3-datos-validacion-exposicion-y-cifrado) |
| Branch | `Security_S3` |
| Threats | T-11, T-12, T-17 (+ e2e for T-10; T-18 compliant; T-21 reserved) |

## Controls implemented

### Input validation
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) — mass assignment → **400**.
- `evidenceLinks` accept only `http`/`https` with required protocol.

### Output exposure
- Domain services serialize via response DTOs only (never raw Prisma entities).
- No `passwordHash`, `notionPageId`, `storageKey`, or `storageBucket` in API responses.
- `syncStatus` remains in project/task/progress responses intentionally (UI sync indicator; not a Notion id).
- Failed reports return generic `errorMessage`: `Report generation failed` (worker detail stays in DB/logs).

### Uploads and files
- Multer `limits.fileSize` = `STORAGE_MAX_UPLOAD_BYTES`, `files: 1` ([`DocumentsModule`](../../src/documents/documents.module.ts)).
- Content MIME allowlist via [`MimeGuardService`](../../src/storage/mime-guard.service.ts).
- Storage object key = `{projectId}/{uuid}`; original name sanitized via [`sanitizeOriginalFilename`](../../src/documents/sanitize-original-filename.ts).
- Downloads only as short-lived signed URLs.

### Errors (T-17)
- [`HttpExceptionFilter`](../../src/common/filters/http-exception.filter.ts): Multer → 413/400; Prisma known errors → 409/404/400 without table/meta leakage; unknown → generic 500; stack only to logger.

### Encryption / transit
- TLS terminated at Railway (HTTPS/WSS); app trusts proxy.
- At-rest encryption provided by Supabase; financial data remains Postgres-only with role gates (S2).

## T-21 SSRF (reserved)

No user-supplied URL is fetched by the API today (`evidenceLinks` are stored only). If outbound URL fetch is added later: allowlist schemes/hosts, block RFC1918 / link-local / cloud metadata (`169.254.169.254`).

## Exit criteria

- [x] Extra body fields → 400 (e2e)
- [x] Uploads: valid PDF OK; MIME spoof / oversize / traversal name hardened (e2e)
- [x] Cross-project document download → 403 (e2e)
- [x] 500 body has no stack / table names (e2e + unit)
- [x] No file served without signed URL
