-- fn_admin_list_admins (Schema §7.9, SUPER_ADMIN).
-- @param {String} $1:adminId
SELECT admin_id, email::text AS email, display_name, role::text AS role, status::text AS status, totp_enabled, locked,
       last_login_at, created_at
FROM fn_admin_list_admins($1::uuid);
