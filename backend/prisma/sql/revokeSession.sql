-- fn_revoke_session (Schema §7.2).
-- @param {String} $1:refreshHash
-- @param {String} $2:installationId?
SELECT revoked FROM fn_revoke_session($1::text, $2::text);
