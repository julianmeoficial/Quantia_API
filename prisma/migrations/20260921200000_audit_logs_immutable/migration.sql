-- S5 / ENG-131: make audit_logs append-only at the database layer.
-- Bypass for test/seed cleanup: SELECT set_config('app.audit_mutable', '1', false);
-- ON DELETE SET NULL on actor_id is allowed (see follow-up migration).
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

DROP TRIGGER IF EXISTS audit_logs_immutable ON "audit_logs";
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_audit_logs_mutation();
