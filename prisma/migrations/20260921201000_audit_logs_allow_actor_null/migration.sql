-- Allow FK ON DELETE SET NULL on actor_id; block all other mutations.
CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.audit_mutable', true) = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Prisma: actor User? onDelete: SetNull — only actor_id may change to NULL.
    IF NEW.actor_id IS NULL
      AND OLD.actor_id IS DISTINCT FROM NEW.actor_id
      AND NEW.id IS NOT DISTINCT FROM OLD.id
      AND NEW.action IS NOT DISTINCT FROM OLD.action
      AND NEW.resource IS NOT DISTINCT FROM OLD.resource
      AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id
      AND NEW.result IS NOT DISTINCT FROM OLD.result
      AND NEW.ip IS NOT DISTINCT FROM OLD.ip
      AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
      AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;

  RETURN NEW;
END;
$$;
