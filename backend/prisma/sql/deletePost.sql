-- fn_delete_post (Schema §7.4): soft delete, photos queued for deletion; idempotent for the author.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
SELECT deleted FROM fn_delete_post($1::uuid, $2::uuid);
