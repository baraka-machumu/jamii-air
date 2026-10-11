-- fn_unblock_user (Schema §7.3): idempotent; follows stay removed.
-- @param {String} $1:viewerId
-- @param {String} $2:targetId
SELECT blocked FROM fn_unblock_user($1::uuid, $2::uuid);
