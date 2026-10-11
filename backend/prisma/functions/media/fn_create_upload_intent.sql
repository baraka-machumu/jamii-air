-- POST /media/uploads (TRD §9, MD-01/06). Creates the PENDING_UPLOAD asset and builds its object
-- key in SQL; Node presigns a PUT to that key. Type and size limits are CHECK constraints.
CREATE OR REPLACE FUNCTION fn_create_upload_intent(
  p_viewer_id uuid,
  p_kind      media_kind,
  p_purpose   media_purpose,
  p_mime_type text,
  p_byte_size bigint)
RETURNS TABLE (media_id uuid, original_key text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_id  uuid := uuidv7();
  v_key text := 'users/' || p_viewer_id || '/media/' || v_id || '/original';
BEGIN
  PERFORM fn__assert_active_user(p_viewer_id);

  INSERT INTO media_assets (id, owner_id, kind, purpose, original_key, mime_type, byte_size)
  VALUES (v_id, p_viewer_id, p_kind, p_purpose, v_key, lower(p_mime_type), p_byte_size);

  RETURN QUERY SELECT v_id, v_key;
END $$;
