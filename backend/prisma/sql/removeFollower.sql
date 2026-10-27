-- fn_remove_follower (Schema §7.3): idempotent; the follower is not told.
-- @param {String} $1:viewerId
-- @param {String} $2:followerId
SELECT follower_count FROM fn_remove_follower($1::uuid, $2::uuid);
