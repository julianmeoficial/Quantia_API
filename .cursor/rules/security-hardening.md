---
name: pentesting
description: Rules of engagement and methodology for the Quantia API penetration test (P0-P6) over the staging environment, using OWASP WSTG and OWASP API Security Top 10 with CVSS v3.1 scoring. Use when planning tests, writing test scripts, triaging findings or drafting the pentest report.
---

# Quantia — Pentesting Rules (P0..P6)

## Rules of engagement — absolute, no exceptions
- Test ONLY the `staging` environment. Production is out of scope.
- Third-party infrastructure (Supabase, Notion, Railway, Vercel control planes) is OUT
  of scope. Never target their dashboards or APIs.
- No sustained denial-of-service and no social engineering.
- Seed, fictional data only. Never real seedbed data.
- Written authorisation from the team and the tutor is required before P1.
- Every activity is logged with date, time and source IP.
- STOP CONDITION: if the environment is actually compromised or non-simulated data is
  reached, stop immediately and notify the team.
- If a requested action falls outside this scope, refuse and propose the in-scope equivalent.

## In scope
`/api/v1/*` on staging, the Socket.io gateway, `/webhooks/notion`, auth/authz logic,
file handling, the API container.

## Test accounts
One per role (Investigador, Coordinador, Administrador) + anonymous, plus TWO
researchers on different projects to prove horizontal escalation.

## Toolchain (do not introduce others without approval)
Recon: `nmap`, `ffuf`, `dirsearch`, `testssl.sh`. Proxy: Burp Suite, OWASP ZAP.
Auth/JWT: `jwt_tool`, `hydra`, Burp Intruder. Injection: `sqlmap` + manual payloads.
Realtime: `socket.io-client` scripts. Platform: Kali Linux.

## P0 — Planning
Authorisation signed, Kali lab with proxy configured, OpenAPI collection imported into
Burp and ZAP, finding template and evidence repository ready BEFORE the first test.

## P1 — Recon and enumeration (verifies S4)
- `nmap` against the staging host: only 443 expected; any extra port is a finding.
- TLS review: versions, cipher suites, HSTS, HTTP -> HTTPS redirect.
- Header review: `helmet()` present, no `X-Powered-By`, no technology/version leak.
- Route fuzzing: undocumented endpoints, old versions such as `/api/v0`, exposed
  Swagger, `.env`, `.git`, debug routes.
- CORS: an arbitrary origin must be rejected; the Vercel preview pattern must not
  admit third-party domains.

## P2 — Authentication and authorization (verifies S2) — highest value
Expected results: no token -> 401 always; JWT tampering (`alg: none`, changed `sub`,
changed role, bad signature) -> rejected; expired or cross-environment token -> 401;
replayed refresh token -> whole family revoked; BOLA (Researcher A requests Researcher
B's project by id) -> 403/404, never 200; BFLA (Researcher hits admin endpoints) -> 403;
mass assignment (`role`, `isAdmin` in body) -> 400; brute force on `/auth/login` ->
progressive lockout and 429; user enumeration -> indistinguishable message and timing;
after logout the token no longer works.

## P3 — Input validation, injection, files (verifies S3)
SQLi with `sqlmap` on search, filter and sort parameters, with special attention to any
dynamic query bypassing the ORM. Header injection reflected in logs or responses.
Stored XSS payloads in project names, notes and progress entries — the API must not
return them unescaped. Property pollution on internal fields (`ownerId`, `createdAt`,
`syncStatus`). Upload abuse: renamed executable, oversized file, spoofed MIME — verify
content-based validation, size cap and signed-URL-only serving. Path traversal in file
names and any path-building parameter.

## P4 — Realtime: WebSocket and webhooks (verifies S2 and S4)
Handshake without or with an invalid JWT must be rejected before joining any room.
Cross-room access must yield no events. Event flooding must hit the per-connection limit
and disconnect abusive sockets. Notion webhook: invalid signature, missing signature,
replayed and out-of-window events must all be rejected and audited. Webhook triggering
from an unauthorised origin must fail.

## P5 — Business logic and configuration (verifies S3, S4, S5)
Sensitive flows (RF-09, RF-18): tamper with budget amounts, skip valid state
transitions, approve resources without the required role. Race conditions: double
submit, double refresh-token consumption. Resource consumption (API4): uncapped
pagination, mass report generation to force Hobby-plan spend. Force 500s and confirm no
stack trace, table name or version leaks. Confirm Swagger is not unprotected and
staging leaks neither secrets nor production data.

## P6 — Report, remediation and retest
- Report structure: executive summary, methodology, and per finding: description,
  CVSS v3.1 severity, reproducible evidence (raw request + response + screenshot),
  impact, concrete remediation.
- Critical and high findings become blocking issues in Linear, each referencing the
  Security phase (S1..S6) that owns the control.
- Remediation is done by the development team, not improvised inside the pentest.
- Retest every fixed finding; close only with evidence it is no longer exploitable.
EXIT: zero open critical/high findings and documented retest of all fixes.

## Reporting style rules
- Never report a vulnerability without a reproducible request/response pair.
- Never inflate severity: justify each CVSS vector.
- Map every finding to its OWASP API Top 10 id and to the S-phase control it breaks.
- Distinguish clearly between confirmed exploitation, suspected issue and hardening advice.