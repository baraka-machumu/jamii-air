-- fn_admin_record_login (Schema §7.9, AP-07): failure count, lock after 10, audit row.
-- @param {String} $1:adminId?
-- @param {Boolean} $2:success
-- @param {String} $3:userAgent?
SELECT failed_login_count, locked FROM fn_admin_record_login($1::uuid, $2::boolean, $3::text);
