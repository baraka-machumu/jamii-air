-- fn_admin_reinstate_user (Schema §7.9): SUSPENDED -> ACTIVE.
-- @param {String} $1:adminId
-- @param {String} $2:userId
-- @param {String} $3:note
-- @param {String} $4:reportId?
SELECT user_id, status::text AS status FROM fn_admin_reinstate_user($1::uuid, $2::uuid, $3::text, $4::uuid);
