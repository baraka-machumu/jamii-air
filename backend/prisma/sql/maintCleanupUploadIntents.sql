-- fn_maint_cleanup_upload_intents (Schema §7.7, hourly): one batch per call.
-- @param {Int} $1:batch
SELECT processed FROM fn_maint_cleanup_upload_intents($1::int);
