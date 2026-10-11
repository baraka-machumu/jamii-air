-- fn_admin_revoke_session (Schema §7.9): ends the cookie's session family.
-- @param {String} $1:tokenHash
SELECT revoked FROM fn_admin_revoke_session($1::text);
