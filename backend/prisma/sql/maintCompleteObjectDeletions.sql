-- fn_maint_complete_object_deletions (Schema §7.7): ids as JSON text.
-- @param {String} $1:idsJson
SELECT processed FROM fn_maint_complete_object_deletions(ARRAY(SELECT jsonb_array_elements_text($1::text::jsonb)::uuid));
