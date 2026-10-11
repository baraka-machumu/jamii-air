-- fn_remove_device_token (Schema §7.6): the viewer's own installation only.
-- @param {String} $1:viewerId
-- @param {String} $2:installationId
SELECT removed FROM fn_remove_device_token($1::uuid, $2::text);
