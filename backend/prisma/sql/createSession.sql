-- fn_create_session (Schema §7.2).
-- @param {String} $1:userId
-- @param {String} $2:refreshHash
-- @param {DateTime} $3:expiresAt
-- @param {String} $4:userAgent?
-- @param {Boolean} $5:cancelDeletion
SELECT family_id FROM fn_create_session($1::uuid, $2::text, $3::timestamptz, $4::text, $5::boolean);
