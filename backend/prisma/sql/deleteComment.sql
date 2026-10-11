-- fn_delete_comment (Schema §7.5): comment author or post author; soft delete.
-- @param {String} $1:viewerId
-- @param {String} $2:commentId
SELECT deleted, comment_count FROM fn_delete_comment($1::uuid, $2::uuid);
