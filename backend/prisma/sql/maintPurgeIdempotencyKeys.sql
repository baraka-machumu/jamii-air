-- fn_maint_purge_idempotency_keys (Schema §7.7, hourly).
-- @param {Int} $1:batch
SELECT processed FROM fn_maint_purge_idempotency_keys($1::int);
