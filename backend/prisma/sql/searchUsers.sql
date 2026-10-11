-- fn_search_users (TRD SR-01): empty query = newest users.
-- @param {String} $1:viewerId
-- @param {String} $2:query
-- @param {Int} $3:limit
SELECT user_id, username::text AS username, display_name, avatar_s_key, is_following
FROM fn_search_users($1::uuid, $2::text, $3::int);
