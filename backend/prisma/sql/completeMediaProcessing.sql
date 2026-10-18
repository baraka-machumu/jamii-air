-- fn_complete_media_processing (Schema §7.4): variants stored, asset READY, post published once
-- every one of its media items is ready. durationMs is video only (BR-CT-08).
-- @param {String} $1:mediaId
-- @param {Int} $2:width
-- @param {Int} $3:height
-- @param {String} $4:blurhash
-- @param {String} $5:variantsJson
-- @param {Int} $6:durationMs?
SELECT post_id, post_published, author_id
FROM fn_complete_media_processing($1::uuid, $2::int, $3::int, $4::text, $5::text::jsonb, $6::int);
