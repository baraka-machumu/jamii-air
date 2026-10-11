-- fn_admin_list_invites (Schema §7.9): newest first.
-- @param {String} $1:adminId
-- @param {DateTime} $2:cursorTime?
-- @param {String} $3:cursorId?
-- @param {Int} $4:limit
SELECT invite_id, code, state, max_uses, use_count, expires_at, revoked_at, created_by_name, created_at
FROM fn_admin_list_invites($1::uuid, $2::timestamptz, $3::uuid, $4::int);
