-- fn_add_comment (Schema §7.5): replayed = Idempotency-Key repeat; notification_id = the COMMENT
-- or REPLY notification to push. parentId makes it a reply (BR-FD-08).
-- @param {String} $1:viewerId
-- @param {String} $2:postId
-- @param {String} $3:body
-- @param {String} $4:parentId?
-- @param {String} $5:idempotencyKey?
-- @param {String} $6:requestHash?
SELECT comment_id, post_id, parent_id, body, created_at, comment_count, parent_reply_count,
       notification_id, replayed
FROM fn_add_comment($1::uuid, $2::uuid, $3::text, $4::uuid, $5::text, $6::text);
