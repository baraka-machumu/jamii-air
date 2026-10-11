-- fn_admin_enable_totp (Schema §7.9, AP-04): encrypted secret sent as base64.
-- @param {String} $1:adminId
-- @param {String} $2:secretEncBase64
SELECT totp_enabled_at FROM fn_admin_enable_totp($1::uuid, decode($2::text, 'base64'));
