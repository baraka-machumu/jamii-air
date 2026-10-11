-- fn_create_password_reset (Schema §7.2): 0 rows for an unknown email.
-- @param {String} $1:email
-- @param {String} $2:codeHash
-- @param {DateTime} $3:expiresAt
SELECT user_id, email::text AS email, locale FROM fn_create_password_reset($1::text, $2::text, $3::timestamptz);
