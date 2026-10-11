-- fn_admin_get_report (Schema §7.9): opening an OPEN report moves it to REVIEWING.
-- @param {String} $1:adminId
-- @param {String} $2:reportId
SELECT report_id, status::text AS status, target_type::text AS target_type, reason::text AS reason, details, created_at,
       resolved_at, resolved_by_name, reporter_id, reporter_username::text AS reporter_username,
       reported_user_id, reported_username::text AS reported_username, reported_display_name,
       reported_user_status::text AS reported_user_status, reported_avatar_key, target, other_reports, user_history
FROM fn_admin_get_report($1::uuid, $2::uuid);
