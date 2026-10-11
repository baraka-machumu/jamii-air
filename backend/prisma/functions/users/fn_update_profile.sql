-- PATCH /me (BR-PR-02, story E1-06). Only keys present in p_patch change:
-- displayName, bio, username, locale, avatarMediaId (null clears displayName / bio / avatar).
-- Unknown keys are ignored. A new avatar must be the viewer's own media with purpose AVATAR that
-- has not failed; a just-uploaded one is marked UPLOADED and the API enqueues its processing (a
-- no-op for READY media). Avatar keys are null until the worker finishes. The replaced avatar is
-- deleted from storage.
CREATE OR REPLACE FUNCTION fn_update_profile(p_viewer_id uuid, p_patch jsonb)
RETURNS TABLE (
  user_id uuid, username citext, display_name varchar, bio varchar, avatar_media_id uuid,
  avatar_s_key text, avatar_m_key text, locale varchar,
  post_count int, follower_count int, following_count int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_constraint text;
  v_old_avatar uuid;
  v_new_avatar uuid;
  m            media_assets%ROWTYPE;
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  SELECT u.avatar_media_id INTO v_old_avatar FROM users u WHERE u.id = p_viewer_id FOR UPDATE;
  v_new_avatar := v_old_avatar;

  IF p_patch ? 'avatarMediaId' THEN
    v_new_avatar := (p_patch->>'avatarMediaId')::uuid;
    IF v_new_avatar IS NOT NULL AND v_new_avatar IS DISTINCT FROM v_old_avatar THEN
      SELECT * INTO m FROM media_assets a WHERE a.id = v_new_avatar FOR UPDATE;
      IF NOT FOUND OR m.owner_id <> p_viewer_id THEN
        RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'MEDIA_NOT_FOUND';
      END IF;
      IF m.purpose <> 'AVATAR' OR m.status IN ('FAILED', 'DELETED') THEN
        RAISE EXCEPTION USING ERRCODE = 'JA400', MESSAGE = 'MEDIA_NOT_ATTACHABLE';
      END IF;
      UPDATE media_assets a SET status = 'UPLOADED' WHERE a.id = v_new_avatar AND a.status = 'PENDING_UPLOAD';
    END IF;
  END IF;

  BEGIN
    UPDATE users u SET
      display_name    = CASE WHEN p_patch ? 'displayName' THEN NULLIF(btrim(p_patch->>'displayName'), '') ELSE u.display_name END,
      bio             = CASE WHEN p_patch ? 'bio'         THEN NULLIF(btrim(p_patch->>'bio'), '')         ELSE u.bio END,
      username        = CASE WHEN p_patch ? 'username'    THEN btrim(p_patch->>'username')               ELSE u.username END,
      locale          = CASE WHEN p_patch ? 'locale'      THEN p_patch->>'locale'                        ELSE u.locale END,
      avatar_media_id = v_new_avatar
    WHERE u.id = p_viewer_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'users_username_key' THEN
      RAISE EXCEPTION USING ERRCODE = 'JA409', MESSAGE = 'USERNAME_TAKEN';
    END IF;
    RAISE;
  END;

  IF v_old_avatar IS NOT NULL AND v_old_avatar IS DISTINCT FROM v_new_avatar THEN
    PERFORM fn__queue_media_deletion(ARRAY[v_old_avatar]);
  END IF;

  RETURN QUERY
  SELECT u.id, u.username, u.display_name, u.bio, u.avatar_media_id, avs.object_key, avm.object_key, u.locale,
         u.post_count, u.follower_count, u.following_count
  FROM users u
  LEFT JOIN media_variants avs ON avs.media_id = u.avatar_media_id AND avs.variant = 'AVATAR_S'
  LEFT JOIN media_variants avm ON avm.media_id = u.avatar_media_id AND avm.variant = 'AVATAR_M'
  WHERE u.id = p_viewer_id;
END $$;
