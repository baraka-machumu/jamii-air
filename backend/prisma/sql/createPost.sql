-- fn_create_post (Schema §7.4): post PROCESSING + media to enqueue; replayed = Idempotency-Key repeat.
-- @param {String} $1:viewerId
-- @param {String} $2:mediaIdsJson
-- @param {String} $3:caption?
-- @param {String} $4:idempotencyKey?
-- @param {String} $5:requestHash?
SELECT post_id, status::text AS status, caption, created_at, media_to_process::text[] AS media_to_process, replayed
FROM fn_create_post($1::uuid, ARRAY(SELECT jsonb_array_elements_text($2::text::jsonb)::uuid), $3::text, $4::text, $5::text);
