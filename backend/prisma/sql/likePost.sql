-- fn_like_post (Schema §8.3): idempotent; notification_id = a new LIKE notification to push.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
SELECT liked, like_count, notification_id FROM fn_like_post($1::uuid, $2::uuid);
