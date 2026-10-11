-- fn_submit_report (Schema §7.8): created = false for a duplicate of an open report.
-- @param {String} $1:viewerId
-- @param {String} $2:targetType
-- @param {String} $3:targetId
-- @param {String} $4:reason
-- @param {String} $5:details?
SELECT report_id, created FROM fn_submit_report($1::uuid, $2::report_target_type, $3::uuid, $4::report_reason, $5::text);
