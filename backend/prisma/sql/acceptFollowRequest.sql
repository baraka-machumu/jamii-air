-- fn_accept_follow_request (Schema §7.3): idempotent; notification_id (FOLLOW_ACCEPTED) for the push job.
-- @param {String} $1:viewerId
-- @param {String} $2:requesterId
SELECT follower_count, notification_id FROM fn_accept_follow_request($1::uuid, $2::uuid);
