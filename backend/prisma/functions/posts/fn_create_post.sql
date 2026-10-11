-- POST /posts (BR-CT-01, TRD §9, API-08). Creates the post as PROCESSING with its media; the API
-- enqueues media_to_process after commit. R1 posts have exactly one photo (carousel: R1.1).
-- Idempotency-Key: a repeat with the same key and request hash returns the original post
-- (replayed = true, nothing to process); the same key with a different request is JA409.
CREATE OR REPLACE FUNCTION fn_create_post(
  p_viewer_id       uuid,
  p_media_ids       uuid[],
  p_caption         text,
  p_idempotency_key text,
  p_request_hash    text)
RETURNS TABLE (
  post_id uuid, status post_status, caption varchar, created_at timestamptz,
  media_to_process uuid[], replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_route   constant text := 'POST /posts';
  v_key     idempotency_keys%ROWTYPE;
  v_rows    int;
  v_post_id uuid;
  v_caption text := NULLIF(btrim(p_caption), '');
  v_media   record;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO idempotency_keys (user_id, key, route, request_hash, response_body)
    VALUES (p_viewer_id, p_idempotency_key, c_route, p_request_hash, '{}')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      SELECT * INTO v_key FROM idempotency_keys k WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
      IF v_key.route <> c_route OR v_key.request_hash <> p_request_hash THEN
        RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN QUERY
      SELECT p.id, p.status, p.caption, p.created_at, '{}'::uuid[], true
      FROM posts p WHERE p.id = (v_key.response_body->>'postId')::uuid;
      RETURN;
    END IF;
  END IF;

  IF length(v_caption) > 2200 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'CAPTION_TOO_LONG';
  END IF;
  IF cardinality(p_media_ids) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
  END IF;

  FOR v_media IN
    SELECT m.id, m.owner_id, m.purpose, m.status FROM media_assets m
    WHERE m.id = ANY (p_media_ids) ORDER BY m.id FOR UPDATE
  LOOP
    IF v_media.owner_id <> p_viewer_id THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
    END IF;
    IF v_media.purpose <> 'POST' OR v_media.status <> 'PENDING_UPLOAD'
       OR EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = v_media.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM media_assets m WHERE m.id = ANY (p_media_ids)) <> cardinality(p_media_ids) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
  END IF;

  INSERT INTO posts (author_id, caption) VALUES (p_viewer_id, v_caption) RETURNING id INTO v_post_id;

  INSERT INTO post_media (post_id, media_id, position)
  SELECT v_post_id, ids.media_id, (ids.ord - 1)::smallint
  FROM unnest(p_media_ids) WITH ORDINALITY AS ids(media_id, ord);

  UPDATE media_assets m SET status = 'UPLOADED' WHERE m.id = ANY (p_media_ids);

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('postId', v_post_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.caption, p.created_at, p_media_ids, false
  FROM posts p WHERE p.id = v_post_id;
END $$;
