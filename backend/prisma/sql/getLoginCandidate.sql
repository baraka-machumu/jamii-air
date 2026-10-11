-- fn_get_login_candidate (Schema §7.2): no row for an unknown identifier.
-- @param {String} $1:identifier
SELECT user_id, password_hash, status::text AS status, deletion_requested_at
FROM fn_get_login_candidate($1::text);
