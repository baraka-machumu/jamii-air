-- fn_maint_purge_expired_tokens (Schema §7.7, daily).
-- @param {Int} $1:batch
SELECT processed FROM fn_maint_purge_expired_tokens($1::int);
