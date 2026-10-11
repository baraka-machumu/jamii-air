-- fn_change_password (Schema §7.2): signs out every other session and device.
-- @param {String} $1:viewerId
-- @param {String} $2:newPasswordHash
-- @param {String} $3:keepFamilyId
-- @param {String} $4:keepInstallationId?
SELECT revoked_sessions FROM fn_change_password($1::uuid, $2::text, $3::uuid, $4::text);
