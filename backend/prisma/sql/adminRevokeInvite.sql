-- fn_admin_revoke_invite (Schema §7.9): idempotent.
-- @param {String} $1:adminId
-- @param {String} $2:inviteId
-- @param {String} $3:note?
SELECT invite_id, revoked_at FROM fn_admin_revoke_invite($1::uuid, $2::uuid, $3::text);
