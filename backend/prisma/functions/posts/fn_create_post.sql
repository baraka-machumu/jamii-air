-- POST /posts (BR-CT-01, TRD §9, API-08). Creates the post as PROCESSING with its media; the API
-- enqueues media_to_process after commit. The post publishes itself once every one of its media
-- items is READY (fn_complete_media_processing), so a carousel appears only when complete.
--
-- Media (BR-CT-09, BR-CT-10): either 1-10 photos, in the order given, or exactly one video —
-- never a mix. The post's type follows the media, PHOTO or VIDEO.
--
-- Hashtags in the caption become rows in post_hashtags (BR-FD-10, fn__sync_post_hashtags).
--
-- Idempotency-Key: a repeat with the same key and request hash returns the original post
-- (replayed = true, nothing to process); the same key with a different request is JA409.
CREATE OR REPLACE FUNCTION fn_create_post(
  p_viewer_id       uuid,
  p_media_ids       uuid[],
  p_caption         text,
  p_idempotency_key text,
  p_request_hash    text)
RETURNS TABLE (
  post_id uuid, status post_status, type post_type, caption varchar, created_at timestamptz,
  media_to_process uuid[], replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_max_media constant int := 10;
  c_route     constant text := 'POST /posts';
  v_replay  jsonb;
  v_post_id uuid;
  v_caption text := NULLIF(btrim(p_caption), '');
  v_media   record;
  v_videos  int := 0;
  v_type    post_type;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  IF p_idempotency_key IS NOT NULL THEN
    v_replay := fn__claim_idempotency_key(p_viewer_id, p_idempotency_key, c_route, p_request_hash);
    IF v_replay IS NOT NULL THEN
      RETURN QUERY
      SELECT p.id, p.status, p.type, p.caption, p.created_at, '{}'::uuid[], true
      FROM posts p WHERE p.id = (v_replay->>'postId')::uuid;
      RETURN;
    END IF;
  END IF;

  IF length(v_caption) > 2200 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'CAPTION_TOO_LONG';
  END IF;
  IF cardinality(p_media_ids) IS NULL OR cardinality(p_media_ids) < 1
     OR cardinality(p_media_ids) > c_max_media THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_media_ids) AS ids(id) GROUP BY ids.id HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
  END IF;

  FOR v_media IN
    SELECT m.id, m.owner_id, m.purpose, m.status, m.kind FROM media_assets m
    WHERE m.id = ANY (p_media_ids) ORDER BY m.id FOR UPDATE
  LOOP
    IF v_media.owner_id <> p_viewer_id THEN
      RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
    END IF;
    IF v_media.purpose <> 'POST' OR v_media.status <> 'PENDING_UPLOAD'
       OR EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id = v_media.id) THEN
      RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
    END IF;
    IF v_media.kind = 'VIDEO' THEN
      v_videos := v_videos + 1;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM media_assets m WHERE m.id = ANY (p_media_ids)) <> cardinality(p_media_ids) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
  END IF;

  -- BR-CT-10: all photos, or one single video.
  IF v_videos = 0 THEN
    v_type := 'PHOTO';
  ELSIF v_videos = 1 AND cardinality(p_media_ids) = 1 THEN
    v_type := 'VIDEO';
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_KINDS_MIXED';
  END IF;

  INSERT INTO posts (author_id, type, caption) VALUES (p_viewer_id, v_type, v_caption)
  RETURNING id INTO v_post_id;

  INSERT INTO post_media (post_id, media_id, position)
  SELECT v_post_id, ids.media_id, (ids.ord - 1)::smallint
  FROM unnest(p_media_ids) WITH ORDINALITY AS ids(media_id, ord);

  UPDATE media_assets m SET status = 'UPLOADED', uploaded_at = now() WHERE m.id = ANY (p_media_ids);

  PERFORM fn__sync_post_hashtags(v_post_id, v_caption);

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE idempotency_keys k SET response_body = jsonb_build_object('postId', v_post_id)
    WHERE k.user_id = p_viewer_id AND k.key = p_idempotency_key;
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.type, p.caption, p.created_at, p_media_ids, false
  FROM posts p WHERE p.id = v_post_id;
END $$;
