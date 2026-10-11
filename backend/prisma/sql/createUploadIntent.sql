-- fn_create_upload_intent (Schema §7.4): PENDING_UPLOAD asset + server-built key.
-- @param {String} $1:viewerId
-- @param {String} $2:kind
-- @param {String} $3:purpose
-- @param {String} $4:mimeType
-- @param {Int} $5:byteSize
SELECT media_id, original_key FROM fn_create_upload_intent($1::uuid, $2::media_kind, $3::media_purpose, $4::text, $5::bigint);
