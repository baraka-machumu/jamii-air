-- fn_admin_rotate_session (Schema §7.9): OK | INVALID | REUSE_DETECTED | EXPIRED | NOT_ACTIVE.
-- @param {String} $1:oldHash
-- @param {String} $2:newHash
-- @param {DateTime} $3:idleExpiresAt
SELECT outcome, admin_id, role::text AS role, family_id FROM fn_admin_rotate_session($1::text, $2::text, $3::timestamptz);
