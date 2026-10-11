-- fn_admin_reset_admin_totp (Schema §7.9, SUPER_ADMIN): forces re-enrolment.
-- @param {String} $1:adminId
-- @param {String} $2:targetId
-- @param {String} $3:note
SELECT admin_id FROM fn_admin_reset_admin_totp($1::uuid, $2::uuid, $3::text);
