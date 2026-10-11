-- fn_admin_change_password (Schema §7.9): ends every session of the admin.
-- @param {String} $1:adminId
-- @param {String} $2:newPasswordHash
SELECT changed FROM fn_admin_change_password($1::uuid, $2::text);
