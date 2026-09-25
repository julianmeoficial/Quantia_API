# ENG-117 — Security program closure (S1–S6)

| Field | Value |
|-------|--------|
| Linear | [ENG-117](https://linear.app/brevku/issue/ENG-117/seguridad-quantia-seguridad-de-la-api-s1-s6) |
| Parent milestone | Seguridad de la API |
| Checkout branch | `Secuirty_Checkout` (formal verification + doc sync) |
| Status | **Closed** — controls implemented; CI gates active on `main` |
| Next phase (done) | Pentesting P0–P6 closed on **local lab** ([`../pentesting/README.md`](../pentesting/README.md); RoE: [`.cursor/rules/pentesting.md`](../../.cursor/rules/pentesting.md)) |

Functional scope: harden the F7-frozen NestJS API (no new domain features). Framework: OWASP API Top 10 (2023) + ASVS L1–L2 (API subset).

---

## 1. ENG-117 acceptance criteria

| # | Criterion (ENG-117) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | Threat matrix approved; controls traceable | **Met** | [`threat-model.md`](./threat-model.md) T-01…T-22 → S2–S5 / Linear; High rows **done** |
| 2 | Zero open **critical/high** in automated analysis (direct deps + CI gates) | **Met** | `npm run audit:ci`; gitleaks; Trivy OS; CodeQL SARIF gate; ESLint security (errors = 0) |
| 3 | Object-level authorization on every id-bearing endpoint | **Met** | `ProjectAccessService`; `test/security-s2.e2e-spec.ts`, `domain.e2e-spec.ts` |
| 4 | No secrets in repo or client logs | **Met** | gitleaks job; Pino redaction [`logger.config.ts`](../../src/common/logger/logger.config.ts); env-only secrets |
| 5 | Rate limiting and audit active in deployed config | **Met** | Redis `ThrottlerModule`; immutable `audit_logs`; [`resilience.md`](./resilience.md) |
| 6 | Secure configuration document for pentest input | **Met** | [`handoff-security.md`](../architecture/handoff-security.md), [`infra-hardening.md`](./infra-hardening.md), OpenAPI + Bruno |

---

## 2. Phase traceability

| Phase | Linear | Merged PR | Primary doc | Automated evidence |
|-------|--------|-----------|-------------|-------------------|
| **S1** | [ENG-127](https://linear.app/brevku/issue/ENG-127) | [#11](https://github.com/julianmeoficial/Quantia_API/pull/11) | [`threat-model.md`](./threat-model.md) | — (documentation) |
| **S2** | [ENG-128](https://linear.app/brevku/issue/ENG-128) | [#12](https://github.com/julianmeoficial/Quantia_API/pull/12) | [`../architecture/auth.md`](../architecture/auth.md) | [`test/security-s2.e2e-spec.ts`](../../test/security-s2.e2e-spec.ts) |
| **S3** | [ENG-129](https://linear.app/brevku/issue/ENG-129) | [#14](https://github.com/julianmeoficial/Quantia_API/pull/14) | [`data-hardening.md`](./data-hardening.md) | [`test/security-s3.e2e-spec.ts`](../../test/security-s3.e2e-spec.ts) |
| **S4** | [ENG-130](https://linear.app/brevku/issue/ENG-130) | [#16](https://github.com/julianmeoficial/Quantia_API/pull/16) | [`infra-hardening.md`](./infra-hardening.md) | [`test/security-s4.e2e-spec.ts`](../../test/security-s4.e2e-spec.ts); gitleaks; Trivy |
| **S5** | [ENG-131](https://linear.app/brevku/issue/ENG-131) | [#17](https://github.com/julianmeoficial/Quantia_API/pull/17) | [`resilience.md`](./resilience.md) | [`test/security-s5.e2e-spec.ts`](../../test/security-s5.e2e-spec.ts) |
| **S6** | [ENG-132](https://linear.app/brevku/issue/ENG-132) | [#18](https://github.com/julianmeoficial/Quantia_API/pull/18) | [`verification.md`](./verification.md), [`asvs-checklist.md`](./asvs-checklist.md) | `audit:ci`, CodeQL, Dependabot |

S6 consolidates pipeline evidence; see [`verification.md`](./verification.md) for blocking policy per job.

---

## 3. High-severity threats (T-01…T-15)

All **High** rows in [`threat-model.md`](./threat-model.md) §7 are marked **done** with implemented controls and e2e or CI where applicable. Shared threats (T-04, T-10, T-13, T-16) span multiple phases as documented in the matrix.

Checkout review (2026-09-22): no High row contradicts current code on `main`.

---

## 4. Accepted deferred items (not blocking P0)

These are **documented** choices to avoid expensive stack churn or out-of-scope ops work:

| Item | Rationale | Where documented |
|------|-----------|------------------|
| `npm` overrides (`multer@2.4.0`, `deepmerge-ts@^8`) | Clears direct high/critical without Nest 12 / Prisma 8 upgrade | [`verification.md`](./verification.md) |
| CodeQL `upload: never` + SARIF gate | Private repo without GHAS; CI still blocks on findings | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) |
| Trivy `vuln-type: os` only | Hobby plan; library CVEs covered by `audit:ci` + Dependabot | [`verification.md`](./verification.md) |
| External alert routing (Slack/email) | In-app metrics + log patterns; Railway rules are ops runbook | [`resilience.md`](./resilience.md) |
| T-21 SSRF controls | No user-controlled URL fetch in API today | [`threat-model.md`](./threat-model.md) T-21 **reserved** |
| Swagger UI off when `NODE_ENV=production` | Staging uses committed OpenAPI + Bruno | [`handoff-security.md`](../architecture/handoff-security.md) |

---

## 5. Pentest handoff

Use **staging** only:

- URL, health, webhook, seed accounts: [`handoff-security.md`](../architecture/handoff-security.md)
- ASVS evidence map: [`asvs-checklist.md`](./asvs-checklist.md)
- Offensive playbook: [`.cursor/rules/pentesting.md`](../../.cursor/rules/pentesting.md)

**ENG-117 EXIT:** merge checkout PR (if any) → close ENG-117 in Linear → start Pentesting milestone.
