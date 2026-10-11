-- GET /admin/reports/:id (App Flow §15.4): the report, a preview of the target (including hidden
-- or deleted content), other reports on the same target and the reported user's moderation
-- history. Opening an OPEN report moves it to REVIEWING.
CREATE OR REPLACE FUNCTION fn_admin_get_report(p_admin_id uuid, p_report_id uuid)
RETURNS TABLE (
  report_id uuid, status report_status, target_type report_target_type, reason report_reason,
  details varchar, created_at timestamptz, resolved_at timestamptz, resolved_by_name varchar,
  reporter_id uuid, reporter_username citext,
  reported_user_id uuid, reported_username citext, reported_display_name varchar,
  reported_user_status user_status, reported_avatar_key text,
  target jsonb, other_reports jsonb, user_history jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM fn__assert_admin(p_admin_id, ARRAY['SUPER_ADMIN', 'MODERATOR']::admin_role[]);

  UPDATE reports r SET status = 'REVIEWING' WHERE r.id = p_report_id AND r.status = 'OPEN';
  IF NOT EXISTS (SELECT 1 FROM reports r WHERE r.id = p_report_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'JA404', MESSAGE = 'REPORT_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT r.id, r.status, r.target_type, r.reason, r.details, r.created_at, r.resolved_at, adm.display_name,
         rep.id, rep.username,
         ru.id, ru.username, ru.display_name, ru.status, av.object_key,
         CASE r.target_type
           WHEN 'POST' THEN (
             SELECT jsonb_build_object('postId', p.id, 'status', p.status, 'caption', p.caption,
                      'createdAt', p.created_at, 'hiddenAt', p.hidden_at, 'deletedAt', p.deleted_at,
                      'feedKey', fv.object_key, 'thumbKey', tv.object_key)
             FROM posts p
             LEFT JOIN post_media pm ON pm.post_id = p.id AND pm.position = 0
             LEFT JOIN media_variants fv ON fv.media_id = pm.media_id AND fv.variant = 'FEED'
             LEFT JOIN media_variants tv ON tv.media_id = pm.media_id AND tv.variant = 'THUMB'
             WHERE p.id = r.target_post_id)
           WHEN 'COMMENT' THEN (
             SELECT jsonb_build_object('commentId', k.id, 'postId', k.post_id, 'body', k.body,
                      'createdAt', k.created_at, 'hiddenAt', k.hidden_at, 'deletedAt', k.deleted_at)
             FROM comments k WHERE k.id = r.target_comment_id)
           ELSE jsonb_build_object('userId', ru.id, 'bio', ru.bio, 'postCount', ru.post_count)
         END,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('reportId', o.id, 'status', o.status, 'reason', o.reason,
                    'reporterUsername', ou.username, 'createdAt', o.created_at) ORDER BY o.created_at DESC)
           FROM reports o JOIN users ou ON ou.id = o.reporter_id
           WHERE o.id <> r.id AND o.target_type = r.target_type
             AND COALESCE(o.target_post_id, o.target_comment_id, o.reported_user_id)
               = COALESCE(r.target_post_id, r.target_comment_id, r.reported_user_id)), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_agg(hist.item ORDER BY hist.created_at DESC) FROM (
             SELECT m.created_at, jsonb_build_object('action', m.action, 'note', m.note, 'adminName', ma.display_name,
                      'createdAt', m.created_at) AS item
             FROM moderation_actions m JOIN admin_users ma ON ma.id = m.admin_id
             WHERE m.target_user_id = r.reported_user_id
             ORDER BY m.created_at DESC LIMIT 20) hist), '[]'::jsonb)
  FROM reports r
  JOIN users rep ON rep.id = r.reporter_id
  JOIN users ru ON ru.id = r.reported_user_id
  LEFT JOIN admin_users adm ON adm.id = r.resolved_by_id
  LEFT JOIN media_variants av ON av.media_id = ru.avatar_media_id AND av.variant = 'AVATAR_S'
  WHERE r.id = p_report_id;
END $$;
