-- fn_admin_list_audit (Schema §7.9): moderation actions + admin events, newest first.
-- @param {String} $1:adminId
-- @param {String} $2:filterAdminId?
-- @param {String} $3:action?
-- @param {DateTime} $4:cursorTime?
-- @param {String} $5:cursorId?
-- @param {Int} $6:limit
SELECT entry_id, source, action, admin_id, admin_name, target_type, target_id, note, details, created_at
FROM fn_admin_list_audit($1::uuid, $2::uuid, $3::text, $4::timestamptz, $5::uuid, $6::int);
