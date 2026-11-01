-- fn_get_ocean_feed (BR-OC-01, Kidili K2.1): every video the viewer may see, newest first, limit + 1 rows.
-- @param {String} $1:viewerId
-- @param {DateTime} $2:cursorTime?
-- @param {String} $3:cursorId?
-- @param {Int} $4:limit
SELECT post_id, created_at, caption, like_count, comment_count, view_count, liked_by_me, saved_by_me,
       author_id, author_username::text AS author_username, author_display_name, author_avatar_key,
       following_author, media
FROM fn_get_ocean_feed($1::uuid, $2::timestamptz, $3::uuid, $4::int);
