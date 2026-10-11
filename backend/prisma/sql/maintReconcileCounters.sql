-- fn_maint_reconcile_counters (Schema §7.7, daily 02:00): NULL = last 25 h.
-- @param {DateTime} $1:since?
SELECT drift FROM fn_maint_reconcile_counters($1::timestamptz);
