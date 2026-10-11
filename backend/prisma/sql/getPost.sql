-- fn_get_post (Schema §7.4): post detail; the author also sees PROCESSING / FAILED.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
SELECT post_id, status::text AS status, created_at, caption, like_count, comment_count, liked_by_me, is_mine,
       author_id, author_username::text AS author_username, author_display_name, author_avatar_key, media
FROM fn_get_post($1::uuid, $2::uuid);
