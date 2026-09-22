# S6 — Verification evidence (ENG-132)

Demonstrates that S2–S5 controls are enforced in CI and documented for pentesting (P0).

Linear: [ENG-132](https://linear.app/brevku/issue/ENG-132/s6-verificacion-y-cierre-sastscaasvs).

## Blocking policy

| Gate | Tool | When | Fail condition |
|------|------|------|----------------|
| Secrets | gitleaks | every PR (`secrets` job) | Any secret |
| SCA | `npm run audit:ci` | every PR (`verify`) | high/critical on **direct** deps |
| SAST (lint) | ESLint + `eslint-plugin-security` | every PR (`verify`) | Lint **errors** |
| SAST (QL) | CodeQL `security-extended` | every PR + push `main` | CodeQL analyze failure / alerts |
| Image | Trivy | every PR after docker build | CRITICAL/HIGH **OS** vulns (unfixed ignored) |
| Security e2e | Jest + Supertest (`security-s2`…`s5`) | every PR | Any failing test |

Transitive moderate findings remain visible via `npm audit` / Dependabot PRs but do not fail `audit:ci`.

## Tool → workflow

| Activity | Config |
|----------|--------|
| gitleaks | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) job `secrets` |
| Trivy | same file, post `docker build` (`vuln-type: os`) |
| npm audit (direct) | [`scripts/audit-direct.mjs`](../../scripts/audit-direct.mjs) + CI step |
| Dependabot | [`.github/dependabot.yml`](../../.github/dependabot.yml) (npm + github-actions, weekly) |
| ESLint security | [`eslint.config.mjs`](../../eslint.config.mjs) |
| CodeQL | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) |
| Security e2e | `test/security-s2.e2e-spec.ts` … `test/security-s5.e2e-spec.ts` |

## Overrides (SCA)

To clear high multer / deepmerge-ts issues **without** upgrading Nest 11 → 12 or Prisma 6 → 8 (locked stack):

```json
"overrides": {
  "multer": "2.4.0",
  "deepmerge-ts": "^8.0.0"
}
```

Documented so Dependabot/reviewers know why overrides exist.

## ASVS + staging for pentest

- Checklist: [`asvs-checklist.md`](./asvs-checklist.md)
- Staging URL, OpenAPI, Bruno, and **seed accounts** (admin / coord / 2 researchers): [`../architecture/handoff-security.md`](../architecture/handoff-security.md)

**S6 EXIT:** this doc + ASVS checklist + green CI (including CodeQL) → ready for pentest **P0** on staging only.
