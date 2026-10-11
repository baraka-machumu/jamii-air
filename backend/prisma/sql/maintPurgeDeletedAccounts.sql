-- fn_maint_purge_deleted_accounts (Schema §7.7, daily 03:30).
-- @param {Int} $1:batch
SELECT processed FROM fn_maint_purge_deleted_accounts($1::int);
