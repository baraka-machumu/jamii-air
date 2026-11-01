-- fn_record_post_view (BR-OC-04): once per person; the author's own plays and photo posts are not counted.
-- @param {String} $1:viewerId
-- @param {String} $2:postId
SELECT view_count, counted FROM fn_record_post_view($1::uuid, $2::uuid);
