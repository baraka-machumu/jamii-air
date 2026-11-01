-- fn_save_post (BR-FD-13): idempotent; JA404 when the viewer may not see the post.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
SELECT saved FROM fn_save_post($1::uuid, $2::uuid);
