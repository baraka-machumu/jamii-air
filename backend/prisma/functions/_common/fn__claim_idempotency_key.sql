-- Idempotency-Key handling for retry-safe POSTs (API-08), shared by fn_create_post and
-- fn_add_comment. Claims (user, key) for this request and returns NULL: the caller does the work,
-- then stores its response in idempotency_keys.response_body. If the key was already used,
-- returns the stored response (a parallel duplicate waits for the first to commit). The same key
-- with a different route or request hash is JA409 IDEMPOTENCY_KEY_REUSED (NULL-safe comparison).
CREATE OR REPLACE FUNCTION fn__claim_idempotency_key(p_user_id uuid, p_key text, p_route text, p_request_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows int;
  k      idempotency_keys%ROWTYPE;
BEGIN
  INSERT INTO idempotency_keys (user_id, key, route, request_hash, response_body)
  VALUES (p_user_id, p_key, p_route, p_request_hash, '{}')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO k FROM idempotency_keys x WHERE x.user_id = p_user_id AND x.key = p_key;
  IF k.route IS DISTINCT FROM p_route OR k.request_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
  END IF;
  RETURN k.response_body;
END $$;
