-- fn_admin_create_invite (Schema §7.9).
-- @param {String} $1:adminId
-- @param {Int} $2:maxUses
-- @param {DateTime} $3:expiresAt?
-- @param {String} $4:note?
SELECT invite_id, code, max_uses, expires_at FROM fn_admin_create_invite($1::uuid, $2::int, $3::timestamptz, $4::text);
