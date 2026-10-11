-- AP-06: admin mutations need a reason of at least 3 characters (JA422 NOTE_REQUIRED).
CREATE OR REPLACE FUNCTION fn__require_note(p_note text)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_note IS NULL OR length(btrim(p_note)) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'JA422', MESSAGE = 'NOTE_REQUIRED';
  END IF;
END $$;
