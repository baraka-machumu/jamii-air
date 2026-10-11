-- fn_add_comment (Schema §7.5): replayed = Idempotency-Key repeat; notification_id = COMMENT to push.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
-- @param {String} $3:body
-- @param {String} $4:idempotencyKey?
-- @param {String} $5:requestHash?
SELECT comment_id, post_id, body, created_at, comment_count, notification_id, replayed
FROM fn_add_comment($1::uuid, $2::uuid, $3::text, $4::text, $5::text);
