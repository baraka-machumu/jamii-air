-- fn_maint_compute_daily_metrics (Schema §7.7, daily 00:30): one EAT calendar day.
-- @param {DateTime} $1:day
SELECT metrics FROM fn_maint_compute_daily_metrics($1::date);
