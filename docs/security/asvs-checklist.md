# OWASP ASVS L1–L2 checklist (API-oriented) — S6 / ENG-132

Scope: Quantia NestJS API (REST `/api/v1`, Socket.io, Notion webhook, worker).  
Levels: **L1** (minimum) and selected **L2** controls that apply to a backend API (no browser UI).

Status: `Done` | `Partial` | `N/A`  
Evidence points to code, tests, or CI.

## V2 — Authentication

| ID | Requirement (summary) | Status | Evidence |
|----|----------------------|--------|----------|
| V2.1.1 | Passwords verified with strong hashing | Done | argon2 in auth; [`src/auth/password.util.ts`](../../src/auth/password.util.ts) |
| V2.2.1 | Anti-automation on auth | Done | Login lockout + auth throttler 10/60s ([`resilience.md`](./resilience.md), S2/S5) |
| V2.3.1 | Session / token lifetime limited | Done | Access JWT 15m + refresh rotation ([`auth.md`](../architecture/auth.md)) |
| V2.5.1 | Credential recovery / enum resistance | Done | Generic login errors + timing pad (S2 e2e) |
| V2.8.1 | Token integrity (alg, iss, aud) | Done | JwtStrategy + `jwt-options`; e2e alg/audience |

## V3 — Session management

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V3.3.1 | Logout invalidates session | Done | Refresh revoke; auth e2e |
| V3.5.1 | Session reuse / refresh replay | Done | Family revoke on reuse (S2) |

## V4 — Access control

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V4.1.1 | Deny by default | Done | Global Jwt + Roles guards |
| V4.1.2 | Object-level authz on IDs | Done | `ProjectAccessService`; security-s2 e2e BOLA |
| V4.1.3 | Function-level authz (roles) | Done | `@Roles`; BFLA e2e |
| V4.2.1 | Mass assignment blocked | Done | ValidationPipe whitelist + forbidNonWhitelisted (S3) |

## V5 — Validation / encoding

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V5.1.1 | Input validated server-side | Done | DTOs class-validator; S3 e2e |
| V5.1.3 | JSON depth / size limits | Done | 1mb + depth 10 (S5) |
| V5.2.1 | File upload type/size | Done | Multer + MIME allowlist (S3) |
| V5.3.x | Injection (SQLi) | Done | Prisma parameterized only |

## V7 — Error handling / logging

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V7.1.1 | No sensitive data in logs | Done | pino redaction ([`logger.config.ts`](../../src/common/logger/logger.config.ts)) |
| V7.4.1 | Generic errors to clients | Done | `HttpExceptionFilter` (S3) |
| V7.1.4 | Security events audited | Done | `audit_logs` + immutable trigger (S5) |

## V8 — Data protection

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V8.1.x | Sensitive data at rest (hashes, no plaintext passwords) | Done | argon2 hashes only |
| V8.3.x | Secrets not in repo | Done | gitleaks CI; `.env` gitignored (S4) |

## V9 — Communication

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V9.1.1 | TLS in transit (deployed) | Done | Railway HTTPS + HSTS header (S4); verify with P1 testssl |
| V9.2.1 | CORS allowlist | Done | No `*`; preview flag blocked in production APP_ENV |

## V10 — Malicious code / supply chain

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V10.3.1 | Dependency monitoring | Done | `audit:ci` + Dependabot (this phase) |
| V10.3.2 | SAST in pipeline | Done | ESLint security + CodeQL |

## V11 — Business logic

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V11.1.x | Anti-automation / quotas | Done | Throttler + WS limits + report quota (S5) |
| V11.1.7 | File download authz | Done | Membership + signed URLs (S3) |

## V12 — Files

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V12.1.1 | Size limits | Done | `STORAGE_MAX_UPLOAD_BYTES` |
| V12.4.1 | Private storage | Done | Supabase private buckets; no public URLs |
| V12.5.1 | Safe serving | Done | Short-lived signed URLs only |

## V13 — API

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V13.1.1 | Authorization on all endpoints | Done | Global guards + `@Public` opt-in |
| V13.2.1 | Rate limiting | Done | Redis throttler (S5) |
| V13.2.2 | Pagination caps | Done | `pageSize` max 50 |
| V13.3.1 | Webhook authenticity | Done | HMAC + skew + replay (S4) |
| V13.4.1 | GraphQL/N/A | N/A | REST + Socket.io only |

## V14 — Configuration

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| V14.1.1 | Build/deploy security scanning | Done | gitleaks + Trivy OS + CodeQL |
| V14.2.1 | Unnecessary features off in prod | Done | Swagger off when `NODE_ENV=production` |
| V14.3.1 | Security headers | Done | helmet + HSTS + CSP (S4; CSP defaults in prod, Swagger-safe relax in non-prod) |
| V14.5.1 | HTTP methods / debug | Done | No debug routes; X-Powered-By disabled |

## Closure

- [x] Checklist reviewed against S2–S5 implementations
- [x] Critical/high **direct** SCA findings cleared (`npm run audit:ci`)
- [x] Staging seed accounts documented for P0 ([`handoff-security.md`](../architecture/handoff-security.md))
- [x] Pipeline gates documented in [`verification.md`](./verification.md)

**ASVS L1–L2 (API subset): complete for S6 EXIT.** Offensive verification P0–P6 is **closed** (local lab / console); see [`../pentesting/README.md`](../pentesting/README.md).
