-- fn_mark_notifications_read (Schema §7.6): ids as JSON text (TypedSQL has no array parameters).
-- @param {String} $1:viewerId
-- @param {String} $2:idsJson
-- @param {Boolean} $3:markAll
SELECT updated
FROM fn_mark_notifications_read($1::uuid, ARRAY(SELECT jsonb_array_elements_text($2::text::jsonb)::uuid), $3::boolean);
