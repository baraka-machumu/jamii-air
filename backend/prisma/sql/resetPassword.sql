-- fn_reset_password (Schema §7.2): outcome OK | INVALID_CODE | EXPIRED | TOO_MANY_ATTEMPTS.
-- @param {String} $1:email
-- @param {String} $2:codeHash
-- @param {String} $3:newPasswordHash
SELECT outcome FROM fn_reset_password($1::text, $2::text, $3::text);
