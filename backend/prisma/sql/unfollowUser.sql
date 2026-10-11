-- fn_unfollow_user (Schema §7.3): idempotent.
-- @param {String} $1:viewerId
-- @param {String} $2:targetId
SELECT following, follower_count FROM fn_unfollow_user($1::uuid, $2::uuid);
