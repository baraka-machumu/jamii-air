-- fn_get_unread_count (Schema §7.6): capped at 100.
-- @param {String} $1:viewerId
SELECT unread_count FROM fn_get_unread_count($1::uuid);
