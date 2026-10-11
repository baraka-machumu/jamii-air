-- fn_admin_get_post (Schema §7.9): any post incl. hidden and deleted.
-- @param {String} $1:adminId
-- @param {String} $2:postId
SELECT post_id, status::text AS status, caption, like_count, comment_count, created_at, published_at, hidden_at,
       deleted_at, author_id, author_username::text AS author_username, author_status::text AS author_status,
       media, reports, moderation_history
FROM fn_admin_get_post($1::uuid, $2::uuid);
