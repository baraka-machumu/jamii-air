-- fn_admin_set_post_hidden (Schema §7.9): PUBLISHED <-> HIDDEN.
-- @param {String} $1:adminId
-- @param {String} $2:postId
-- @param {Boolean} $3:hidden
-- @param {String} $4:note
-- @param {String} $5:reportId?
SELECT post_id, status::text AS status FROM fn_admin_set_post_hidden($1::uuid, $2::uuid, $3::boolean, $4::text, $5::uuid);
