-- fn_maint_purge_old_notifications (Schema §7.7, daily).
-- @param {Int} $1:batch
SELECT processed FROM fn_maint_purge_old_notifications($1::int);
