-- fn_rotate_refresh_token (Schema §8.2): outcome OK | INVALID | REUSE_DETECTED | EXPIRED | NOT_ACTIVE.
-- @param {String} $1:oldHash
-- @param {String} $2:newHash
-- @param {DateTime} $3:newExpiresAt
SELECT outcome, user_id, family_id FROM fn_rotate_refresh_token($1::text, $2::text, $3::timestamptz);
