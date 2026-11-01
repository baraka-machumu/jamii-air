-- fn_unsave_post (BR-FD-13): idempotent; always saved = false.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
SELECT saved FROM fn_unsave_post($1::uuid, $2::uuid);
