-- fn_upsert_device_token (Schema §7.6): one row per app installation.
-- @param {String} $1:viewerId
-- @param {String} $2:installationId
-- @param {String} $3:token
-- @param {String} $4:platform
-- @param {String} $5:appVersion?
-- @param {String} $6:locale?
SELECT installation_id FROM fn_upsert_device_token($1::uuid, $2::text, $3::text, $4::platform, $5::text, $6::text);
