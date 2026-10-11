-- fn_unlike_post (Schema §7.5): idempotent.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
SELECT liked, like_count FROM fn_unlike_post($1::uuid, $2::uuid);
