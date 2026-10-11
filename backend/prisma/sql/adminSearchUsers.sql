-- fn_admin_search_users (Schema §7.9): newest accounts first.
-- @param {String} $1:adminId
-- @param {String} $2:q?
-- @param {String} $3:status?
-- @param {DateTime} $4:cursorTime?
-- @param {String} $5:cursorId?
-- @param {Int} $6:limit
SELECT user_id, username::text AS username, display_name, email::text AS email, status::text AS status, avatar_s_key,
       post_count, follower_count, open_reports, last_active_at, created_at
FROM fn_admin_search_users($1::uuid, $2::text, $3::user_status, $4::timestamptz, $5::uuid, $6::int);
