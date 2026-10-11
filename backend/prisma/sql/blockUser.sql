-- fn_block_user (Schema §7.3): idempotent; removes follows both ways.
-- @param {String} $1:viewerId
-- @param {String} $2:targetId
SELECT blocked FROM fn_block_user($1::uuid, $2::uuid);
