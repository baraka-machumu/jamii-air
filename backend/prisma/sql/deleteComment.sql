-- fn_delete_comment (Schema §7.5): comment author or post author; soft delete, and a top-level
-- comment takes the thread under it (BR-FD-08).
-- @param {String} $1:viewerId
-- @param {String} $2:commentId
SELECT deleted, comment_count, parent_reply_count FROM fn_delete_comment($1::uuid, $2::uuid);
