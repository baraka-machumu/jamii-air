-- fn_admin_dashboard (Schema §7.9, BR-DI-01): live counts + daily KPIs per metric.
-- @param {String} $1:adminId
-- @param {DateTime} $2:from
-- @param {DateTime} $3:to
SELECT open_reports, oldest_open_report_at, suspended_users, invites_remaining, registered_users, metrics
FROM fn_admin_dashboard($1::uuid, $2::date, $3::date);
