-- fn_maint_purge_deleted_content (Schema §7.7, daily 03:00).
-- @param {Int} $1:batch
SELECT processed FROM fn_maint_purge_deleted_content($1::int);
