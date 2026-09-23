---
name: security-hardening
description: Rules for the Quantia API security hardening phase (S1-S6), based on OWASP API Security Top 10 2023 and ASVS L1-L2. Use when auditing, hardening, reviewing or fixing security issues in the API, its container or its deployment chain.
---

# Quantia API — Security Hardening Rules (S1..S6)

## Scope discipline
Input: functionally frozen API from F7. NO new features in this phase — only controls,
fixes and evidence. If a security fix requires a behaviour change, state it explicitly
and justify it against a requirement (RF-02, RF-18, RNF-02..RNF-04, RNF-09).
Framework: OWASP API Security Top 10 (2023) + OWASP ASVS L1-L2.

## S1 — Threat modelling and attack surface
- Asset inventory: user credentials, budget and financial execution, Storage documents,
  Notion integration token, Supabase `service_role` key, `JWT_SECRET`, DB connection string.
- Entry inventory: every `/api/v1/*` route, the WebSocket gateway, `/webhooks/notion`,
  file upload, container env vars.
- Actors: anonymous, Investigador, Coordinador, Administrador, Notion, the worker.
- Method: STRIDE per trust boundary, prioritised by impact x likelihood.
- Pre-identified critical scenarios: horizontal escalation between projects (BOLA),
  Notion webhook spoofing, integration-token leak, cross-seedbed document access.
EXIT: every high-severity threat has a planned control in S2..S5 with an owner.

## S2 — Identity: authentication and authorization (API1, API2, API5)
- Reject `alg: none` and algorithm confusion explicitly. HS256 with a high-entropy
  secret, or RS256.
- Validate `iss`, `aud`, `exp` and `sub` on every token.
- Object-level authorization on EVERY query receiving an identifier: filter by project
  membership at the query level. A `projectId` in the body is never trusted.
- `RolesGuard` deny-by-default: an endpoint without a decorator stays protected.
- Progressive lockout per account and per IP on `/auth/login`, with a generic response
  that does not reveal whether the user exists (constant-ish timing).
- WebSocket handshake validates the JWT AND room membership before `socket.join()`.
- Logout revokes the refresh token in the database.
EXIT: automated tests attempting cross-user and cross-role access, all returning 403.

## S3 — Data: validation, exposure, encryption (API3, API6, API7)
- Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`:
  any undeclared field -> 400. This is the mass-assignment cut-off.
- Output serialisation with response DTOs. Never the raw entity. Password hashes,
  internal tokens and Notion ids never leave the API.
- Parameterised queries through the ORM. Raw SQL only with written justification and
  bound parameters.
- Uploads: MIME allowlist verified by content, size limit, UUID rename, private bucket,
  download only via short-lived signed URL.
- Validate any externally supplied URL before fetching it (SSRF: block private ranges,
  localhost, metadata endpoints).
- TLS everywhere (HTTPS + WSS, no plain port exposed). Financial data restricted by
  role at service level.
- 500 responses without stack traces, table names or dependency versions.
EXIT: no endpoint returns a field outside its response DTO; no file is reachable unsigned.

## S4 — Infrastructure, secrets, deployment (API8, API9, API10)
- Secrets only in Railway / Vercel / GitHub Actions env vars. No committed `.env`.
  `gitleaks` in CI, including history. Documented rotation of the Notion token and `JWT_SECRET`.
- The Supabase `service_role` key lives ONLY in the API container. Row Level Security
  enabled as a second barrier.
- Container: non-root user, `node:22-alpine`, no debug tooling in production,
  `NODE_ENV=production`, image scanned with `trivy`.
- `helmet()` active, `X-Powered-By` disabled, HSTS on, strict CORS allowlist
  (production domain + Vercel preview pattern). Credentials allowed only where required.
- `staging` and `production` fully isolated: different databases, secrets and Redis.
  Swagger exposed only on staging, or auth-protected in production.
- Notion webhook: signature verified against the stored `verification_token`,
  constant-time comparison, replay and out-of-window events rejected.
EXIT: repo free of secrets, image with no critical vulnerabilities, production config strictly tighter than staging.

## S5 — Resilience, audit, observability (API4, API9, RF-18, RNF-09)
- `ThrottlerModule` backed by Redis, with differentiated limits: aggressive on
  `/auth/*`, moderate on reads, strict on report generation.
- Quotas: body size, object depth, max page size, files per request. This also protects
  the Hobby-plan budget from anomalous consumption.
- Gateway protection: connection limit per user, events per second, idle socket disconnect.
- Immutable `audit_log`: actor, action, resource, result, IP, timestamp. Insert-only
  from the application; no update or delete paths.
- Safe logs: JSON with `requestId`, automatic redaction of passwords, tokens and
  `Authorization` headers. Security-relevant events also persisted in Postgres (logs
  are retained only 7 days).
- Alerts: spikes of 401/403, repeated `sync_status = failed`, anomalous Railway usage.
EXIT: an abuse attempt is rate-limited, recorded and visible; logs contain zero secrets.

## S6 — Verification and closure
Blocking pipeline policy: the build FAILS on critical/high vulnerabilities in direct
dependencies and on ANY detected secret.
- SCA: `npm audit` + Dependabot, every PR.
- SAST: ESLint security plugins + CodeQL, every PR.
- Secrets: `gitleaks`, every PR.
- Image: `trivy`, every build.
- Security e2e: Jest + Supertest, every PR.
- Manual: OWASP ASVS L1-L2 checklist at phase closure.
EXIT: checklist complete, critical/high findings fixed, staging prepared with test
accounts for pentesting.

## Acceptance criteria for the phase
1. Approved threat matrix with traceable controls.
2. Zero open critical/high findings in automated analysis.
3. Object-level authorization verified on every endpoint that receives an identifier.
4. No secrets in the repository or in logs.
5. Rate limiting and audit active in production.
6. Secure configuration document delivered as pentesting input.

## Never do this
- Never weaken a control to make a test pass; fix the test or the design.
- Never log a token, password, signed URL or full `Authorization` header, not even at debug level.
- Never mark a finding as resolved without a regression test proving it.
- Never introduce a new dependency to solve a security issue that a built-in Nest/helmet
  feature already covers.
