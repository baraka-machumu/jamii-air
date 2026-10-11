-- fn_admin_set_comment_hidden (Schema §7.9).
-- @param {String} $1:adminId
-- @param {String} $2:commentId
-- @param {Boolean} $3:hidden
-- @param {String} $4:note
-- @param {String} $5:reportId?
SELECT comment_id, hidden FROM fn_admin_set_comment_hidden($1::uuid, $2::uuid, $3::boolean, $4::text, $5::uuid);
