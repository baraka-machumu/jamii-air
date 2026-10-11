-- fn_fail_media_processing (Schema §7.4, MD-03): asset and post FAILED.
-- @param {String} $1:mediaId
-- @param {String} $2:reason
SELECT post_id, author_id FROM fn_fail_media_processing($1::uuid, $2::text);
