-- fn_admin_get_login_candidate (Schema §7.9): no row for an unknown email. Secret as base64.
-- @param {String} $1:email
SELECT admin_id, display_name, password_hash, role::text AS role, status::text AS status, totp_enabled,
       encode(totp_secret_enc, 'base64') AS totp_secret_enc, locked
FROM fn_admin_get_login_candidate($1::text);
