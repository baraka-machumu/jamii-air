-- fn_admin_create_admin (Schema §7.9, SUPER_ADMIN): JA409 EMAIL_TAKEN.
-- @param {String} $1:adminId
-- @param {String} $2:email
-- @param {String} $3:displayName
-- @param {String} $4:role
-- @param {String} $5:passwordHash
SELECT admin_id FROM fn_admin_create_admin($1::uuid, $2::text, $3::text, $4::admin_role, $5::text);
