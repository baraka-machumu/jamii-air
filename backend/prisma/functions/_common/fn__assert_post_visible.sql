-- Returns the author of a post the viewer may see and interact with: PUBLISHED, author ACTIVE,
-- no block either way. Anything else raises JA404 POST_NOT_FOUND (AU-08).
CREATE OR REPLACE FUNCTION fn__assert_post_visible(p_viewer_id uuid, p_post_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  SELECT p.author_id INTO v_author_id
  FROM posts p JOIN users u ON u.id = p.author_id
  WHERE p.id = p_post_id AND p.status = 'PUBLISHED' AND u.status = 'ACTIVE';

  IF NOT FOUND OR fn__is_blocked_either_way(p_viewer_id, v_author_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'POST_NOT_FOUND';
  END IF;
  RETURN v_author_id;
END $$;
