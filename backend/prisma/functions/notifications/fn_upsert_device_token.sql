-- PUT /me/devices/:installationId (BR-NT-03). One row per app installation; a phone that
-- switches accounts moves to the new user. The same Expo token under an older installation id
-- (reinstall) is removed so nobody gets duplicate pushes.
CREATE OR REPLACE FUNCTION fn_upsert_device_token(
  p_viewer_id       uuid,
  p_installation_id text,
  p_token           text,
  p_platform        platform,
  p_app_version     text,
  p_locale          text)
RETURNS TABLE (installation_id varchar)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  DELETE FROM device_push_tokens d WHERE d.expo_push_token = p_token AND d.installation_id <> p_installation_id;

  INSERT INTO device_push_tokens AS d (installation_id, user_id, expo_push_token, platform, app_version, locale)
  VALUES (p_installation_id, p_viewer_id, p_token, p_platform, p_app_version, p_locale)
  ON CONFLICT (installation_id) DO UPDATE
    SET user_id = EXCLUDED.user_id, expo_push_token = EXCLUDED.expo_push_token, platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version, locale = EXCLUDED.locale, last_seen_at = now();

  RETURN QUERY SELECT p_installation_id::varchar;
END $$;
