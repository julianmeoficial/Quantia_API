# Security documentation

Hardening evidence for the Quantia API after the F7 functional freeze. Phases follow [ENG-117](https://linear.app/brevku/issue/ENG-117/seguridad-quantia-seguridad-de-la-api-s1-s6) and [Notion — Seguridad de la API](https://app.notion.com/p/891a93fd625a4ae7bfed0c9ed6649a26).

| Doc | Phase | Purpose |
|-----|-------|---------|
| [`threat-model.md`](./threat-model.md) | **S1** (ENG-127) | Assets, attack surface, STRIDE, threat matrix → controls in S2–S5 |
| [`../architecture/auth.md`](../architecture/auth.md) | **S2** (ENG-128) | JWT iss/aud, lockout, object-level authz |

## Related architecture inputs

- [`../architecture/inventory.md`](../architecture/inventory.md) — REST, WebSocket, jobs, tables, buckets
- [`../architecture/handoff-security.md`](../architecture/handoff-security.md) — F7 freeze, staging, seed accounts
- [`../architecture/auth.md`](../architecture/auth.md), [`notion.md`](../architecture/notion.md), [`realtime.md`](../architecture/realtime.md), [`budget-storage-reports.md`](../architecture/budget-storage-reports.md)

## Phase map

| Branch convention | Linear | Focus |
|-------------------|--------|--------|
| `Security_S1` | ENG-127 | Threat modelling (this folder) |
| `Security_S2` | ENG-128 | AuthN / AuthZ (BOLA, BFLA) |
| `Security_S3` | ENG-129 | Validation, exposure, encryption |
| `Security_S4` | ENG-130 | Secrets, infra, container, webhook |
| `Security_S5` | ENG-131 | Rate limit, audit, logs |
| `Security_S6` | ENG-132 | SAST / SCA / ASVS checklist |

Cursor rules: `.cursor/rules/security-hardening.md` (S1–S6), `.cursor/rules/pentesting.md` (P0–P6 after S6).
