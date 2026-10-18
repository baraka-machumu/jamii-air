-- Media worker, after sharp produced the variants (TRD §9). Stores the variants, marks the asset
-- READY and publishes its post once every media item of the post is READY (post_count + 1).
-- p_variants: [{ "variant": "FEED", "objectKey": "...", "width": 1080, "height": 1350,
--                "mimeType": "image/webp", "byteSize": 123456 }, ...]
-- p_duration_ms: video only (BR-CT-08), the length of the rendition that was produced. A CHECK
-- refuses it on an image and caps it at 65 s.
-- Safe to retry: a READY asset returns post_published = false. If the post was deleted while
-- processing, the variants just written are queued for deletion and nothing is published.
CREATE OR REPLACE FUNCTION fn_complete_media_processing(
  p_media_id uuid,
  p_width    int,
  p_height   int,
  p_blurhash text,
  p_variants jsonb,
  p_duration_ms int DEFAULT NULL)
RETURNS TABLE (post_id uuid, post_published boolean, author_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  m         media_assets%ROWTYPE;
  v_post_id uuid;
  v_prefix  text;
  v_rows    int;
BEGIN
  SELECT * INTO m FROM media_assets a WHERE a.id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
  END IF;

  SELECT pm.post_id INTO v_post_id FROM post_media pm WHERE pm.media_id = p_media_id;

  IF m.status = 'DELETED' THEN
    PERFORM fn__queue_media_deletion(ARRAY[p_media_id]);
    RETURN QUERY SELECT v_post_id, false, m.owner_id; RETURN;
  ELSIF m.status = 'READY' THEN
    RETURN QUERY SELECT v_post_id, false, m.owner_id; RETURN;
  ELSIF m.status NOT IN ('UPLOADED', 'PROCESSING') THEN
    RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'INVALID_STATE';
  END IF;

  v_prefix := 'users/' || m.owner_id || '/media/' || m.id || '/';
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_variants) v WHERE NOT starts_with(v->>'objectKey', v_prefix)) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'INVALID_VARIANT_KEY';
  END IF;

  INSERT INTO media_variants (media_id, variant, object_key, width, height, mime_type, byte_size)
  SELECT p_media_id, v.variant::media_variant_type, v."objectKey", v.width, v.height, v."mimeType", v."byteSize"
  FROM jsonb_to_recordset(p_variants)
    AS v(variant text, "objectKey" text, width int, height int, "mimeType" text, "byteSize" int)
  ON CONFLICT (media_id, variant) DO UPDATE
    SET object_key = EXCLUDED.object_key, width = EXCLUDED.width, height = EXCLUDED.height,
        mime_type = EXCLUDED.mime_type, byte_size = EXCLUDED.byte_size;

  UPDATE media_assets a
  SET status = 'READY', width = p_width, height = p_height, blurhash = p_blurhash,
      duration_ms = COALESCE(p_duration_ms, a.duration_ms),
      failure_reason = NULL, processed_at = now()
  WHERE a.id = p_media_id;

  IF v_post_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, m.owner_id; RETURN;
  END IF;

  UPDATE posts p SET status = 'PUBLISHED', published_at = now()
  WHERE p.id = v_post_id AND p.status = 'PROCESSING'
    AND NOT EXISTS (SELECT 1 FROM post_media pm JOIN media_assets a ON a.id = pm.media_id
                    WHERE pm.post_id = v_post_id AND a.status <> 'READY');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 1 THEN
    UPDATE users u SET post_count = u.post_count + 1 WHERE u.id = m.owner_id;
  END IF;

  RETURN QUERY SELECT v_post_id, v_rows = 1, m.owner_id;
END $$;
