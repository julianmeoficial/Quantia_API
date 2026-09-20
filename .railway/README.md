# Railway Infrastructure as Code

Authoring file: [`railway.ts`](./railway.ts) (imported from live staging via
`railway config pull`, ENG-158).

Config as Code (`railway.toml` / `railway.json`) is **removed** from this repo.
Hard cutoff for remaining CaC readers: **2026-12-01**.

```bash
# From repo root (project token as RAILWAY_TOKEN, or `railway login` + link)
npx railway config plan
npx railway config apply
```

Omitting a resource from `railway.ts` **deletes** it on apply. Legacy `api` and
Redis stay declared on purpose. Prefer `--yes` only after reviewing the plan;
add `--confirm-destructive` only for intentional destroys.
