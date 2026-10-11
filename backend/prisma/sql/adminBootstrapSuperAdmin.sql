-- fn_admin_bootstrap_super_admin (Schema §7.9): only while there are no admins.
-- @param {String} $1:email
-- @param {String} $2:displayName
-- @param {String} $3:passwordHash
SELECT admin_id FROM fn_admin_bootstrap_super_admin($1::text, $2::text, $3::text);
