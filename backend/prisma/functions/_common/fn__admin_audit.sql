-- Writes one admin_audit_log row (AP-06: logins, admin management, invites). Called inside the
-- procedure that performs the action, so the audit row cannot be skipped.
CREATE OR REPLACE FUNCTION fn__admin_audit(
  p_admin_id    uuid,
  p_action      text,
  p_target_type text  DEFAULT NULL,
  p_target_id   uuid  DEFAULT NULL,
  p_details     jsonb DEFAULT NULL)
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = public, pg_temp
AS $$
  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, NULLIF(jsonb_strip_nulls(p_details), '{}'::jsonb));
$$;
