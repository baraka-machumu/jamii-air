-- fn_decline_follow_request (Schema §7.3): idempotent; the requester is not told.
-- @param {String} $1:viewerId
-- @param {String} $2:requesterId
SELECT declined FROM fn_decline_follow_request($1::uuid, $2::uuid);
