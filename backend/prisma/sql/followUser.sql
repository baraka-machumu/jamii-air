-- fn_follow_user (Schema §7.3): idempotent; notification_id for the push job.
-- @param {String} $1:viewerId
-- @param {String} $2:targetId
SELECT following, follower_count, notification_id FROM fn_follow_user($1::uuid, $2::uuid);
