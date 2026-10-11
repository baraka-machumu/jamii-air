-- fn_admin_list_reports (Schema §7.9): oldest first; statuses as JSON text, NULL = OPEN + REVIEWING.
-- @param {String} $1:adminId
-- @param {String} $2:statusesJson?
-- @param {String} $3:targetType?
-- @param {DateTime} $4:cursorTime?
-- @param {String} $5:cursorId?
-- @param {Int} $6:limit
SELECT report_id, status::text AS status, target_type::text AS target_type, reason::text AS reason, details, created_at,
       reporter_id, reporter_username::text AS reporter_username, reported_user_id,
       reported_username::text AS reported_username, reported_user_status::text AS reported_user_status,
       target_post_id, target_comment_id, target_preview, target_thumb_key, open_reports_on_target
FROM fn_admin_list_reports($1::uuid,
  CASE WHEN $2::text IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text($2::text::jsonb)::report_status) END,
  $3::report_target_type, $4::timestamptz, $5::uuid, $6::int);
