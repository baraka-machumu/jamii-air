-- fn_admin_update_report (Schema §7.9): REVIEWING, RESOLVED or DISMISSED (+ note).
-- @param {String} $1:adminId
-- @param {String} $2:reportId
-- @param {String} $3:status
-- @param {String} $4:note?
SELECT report_id, status::text AS status FROM fn_admin_update_report($1::uuid, $2::uuid, $3::report_status, $4::text);
