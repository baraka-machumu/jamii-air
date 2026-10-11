-- Media worker, when the decoded file is not a valid image or processing gave up (MD-03):
-- asset FAILED, and its post (if still PROCESSING) FAILED. Returns who to tell.
CREATE OR REPLACE FUNCTION fn_fail_media_processing(p_media_id uuid, p_reason text)
RETURNS TABLE (post_id uuid, author_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  m         media_assets%ROWTYPE;
  v_post_id uuid;
BEGIN
  SELECT * INTO m FROM media_assets a WHERE a.id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
  END IF;

  SELECT pm.post_id INTO v_post_id FROM post_media pm WHERE pm.media_id = p_media_id;

  IF m.status IN ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING') THEN
    UPDATE media_assets a SET status = 'FAILED', failure_reason = left(p_reason, 255) WHERE a.id = p_media_id;
    UPDATE posts p SET status = 'FAILED' WHERE p.id = v_post_id AND p.status = 'PROCESSING';
  END IF;

  RETURN QUERY SELECT v_post_id, m.owner_id;
END $$;
