-- fn_admin_create_session (Schema §7.9, TRD §8.2).
-- @param {String} $1:adminId
-- @param {String} $2:tokenHash
-- @param {DateTime} $3:idleExpiresAt
-- @param {DateTime} $4:absoluteExpiresAt
-- @param {String} $5:userAgent?
SELECT family_id FROM fn_admin_create_session($1::uuid, $2::text, $3::timestamptz, $4::timestamptz, $5::text);
