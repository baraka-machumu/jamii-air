-- fn_register_user (Schema §7.2): user + first session in one transaction.
-- @param {String} $1:email
-- @param {String} $2:username
-- @param {String} $3:passwordHash
-- @param {DateTime} $4:dateOfBirth
-- @param {String} $5:inviteCode?
-- @param {String} $6:locale
-- @param {Boolean} $7:requireInvite
-- @param {String} $8:refreshHash
-- @param {DateTime} $9:refreshExpiresAt
-- @param {String} $10:userAgent?
SELECT user_id, family_id
FROM fn_register_user($1::text, $2::text, $3::text, $4::date, $5::text, $6::text, $7::boolean, $8::text, $9::timestamptz, $10::text);
