-- fn_admin_revoke_user_sessions (Schema §7.9): signs a user out everywhere.
-- @param {String} $1:adminId
-- @param {String} $2:userId
-- @param {String} $3:note
SELECT revoked_sessions FROM fn_admin_revoke_user_sessions($1::uuid, $2::uuid, $3::text);
