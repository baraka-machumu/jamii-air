-- fn_admin_update_admin (Schema §7.9, SUPER_ADMIN): role and / or status (NULL = unchanged).
-- @param {String} $1:adminId
-- @param {String} $2:targetId
-- @param {String} $3:role?
-- @param {String} $4:status?
-- @param {String} $5:note
SELECT admin_id, role::text AS role, status::text AS status, locked
FROM fn_admin_update_admin($1::uuid, $2::uuid, $3::admin_role, $4::admin_status, $5::text);
