-- Daily 03:00 (Schema §11): permanently removes
--   posts deleted > 30 days ago, failed posts untouched for 30 days, and posts hidden by a
--   moderator > 90 days ago with no open report on them (their photos are queued for deletion);
--   comments deleted > 30 days ago, and hidden > 90 days ago with no open report.
-- Nothing with an OPEN or REVIEWING report is removed, so deleting reported content cannot destroy
-- the evidence before a moderator acts.
-- Likes, comments and notifications of a removed post go with it (foreign keys). Counters need no
-- change: none of this content is counted any more. Returns posts + comments removed.
CREATE OR REPLACE FUNCTION fn_maint_purge_deleted_content(p_batch int DEFAULT 500)
RETURNS TABLE (processed int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_posts    uuid[];
  v_media    uuid[];
  v_requeue  uuid[];
  v_comments int;
BEGIN
  SELECT array_agg(s.id) INTO v_posts FROM (
    SELECT p.id FROM posts p
    WHERE ((p.status = 'DELETED' AND p.deleted_at < now() - INTERVAL '30 days')
        OR (p.status = 'FAILED'  AND p.updated_at < now() - INTERVAL '30 days')
        OR (p.status = 'HIDDEN'  AND p.hidden_at  < now() - INTERVAL '90 days'))
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_post_id = p.id AND r.status IN ('OPEN', 'REVIEWING'))
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ) s;

  IF v_posts IS NOT NULL THEN
    SELECT array_agg(pm.media_id), array_agg(pm.media_id) FILTER (WHERE m.status <> 'DELETED')
    INTO v_media, v_requeue
    FROM post_media pm JOIN media_assets m ON m.id = pm.media_id
    WHERE pm.post_id = ANY (v_posts);

    IF v_requeue IS NOT NULL THEN
      PERFORM fn__queue_media_deletion(v_requeue);
    END IF;
    DELETE FROM posts p WHERE p.id = ANY (v_posts);
    DELETE FROM media_assets m WHERE m.id = ANY (COALESCE(v_media, '{}'));
  END IF;

  WITH gone AS (
    SELECT k.id FROM comments k
    WHERE ((k.deleted_at < now() - INTERVAL '30 days')
        OR (k.deleted_at IS NULL AND k.hidden_at < now() - INTERVAL '90 days'))
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_comment_id = k.id AND r.status IN ('OPEN', 'REVIEWING'))
    LIMIT GREATEST(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM comments k USING gone WHERE k.id = gone.id;
  GET DIAGNOSTICS v_comments = ROW_COUNT;

  RETURN QUERY SELECT COALESCE(cardinality(v_posts), 0) + v_comments;
END $$;
