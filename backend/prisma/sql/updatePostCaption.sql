-- fn_update_post_caption (Schema §7.4): author only.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
-- @param {String} $3:caption?
SELECT post_id, caption, updated_at FROM fn_update_post_caption($1::uuid, $2::uuid, $3::text);
