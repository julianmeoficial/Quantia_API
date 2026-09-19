-- F7 / ENG-126: enable RLS deny-by-default for Supabase PostgREST roles.
-- NestJS Prisma uses DATABASE_URL (postgres / pooler role) which bypasses RLS
-- unless FORCE ROW LEVEL SECURITY is set — we intentionally do NOT force it.
-- No permissive policies for anon/authenticated.
-- Note: bootstrap_meta was dropped in auth migration; not included.

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "progress_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budget_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Harden PostgREST / client keys (idempotent if roles missing locally).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE
      "roles",
      "users",
      "user_roles",
      "refresh_tokens",
      "projects",
      "project_members",
      "tasks",
      "progress_entries",
      "sync_events",
      "budgets",
      "budget_items",
      "budget_executions",
      "documents",
      "reports",
      "audit_logs"
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      "roles",
      "users",
      "user_roles",
      "refresh_tokens",
      "projects",
      "project_members",
      "tasks",
      "progress_entries",
      "sync_events",
      "budgets",
      "budget_items",
      "budget_executions",
      "documents",
      "reports",
      "audit_logs"
    FROM authenticated;
  END IF;
END
$$;
