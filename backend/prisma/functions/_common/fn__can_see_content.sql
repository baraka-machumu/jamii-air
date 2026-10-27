-- Whether the viewer may see an account's posts and its follower / following lists (BR-PR-08):
-- their own, any public account's, and a private account's once they are an approved follower.
-- Only the private-account rule: status and blocks are checked by the callers, as before.
CREATE OR REPLACE FUNCTION fn__can_see_content(p_viewer_id uuid, p_author_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_viewer_id = p_author_id
      OR NOT COALESCE((SELECT u.is_private FROM users u WHERE u.id = p_author_id), false)
      OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = p_viewer_id AND f.following_id = p_author_id)
$$;
