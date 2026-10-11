-- fn_mark_notification_pushed (Schema §7.6, push worker): a retried job does not send twice.
-- @param {String} $1:notificationId
SELECT updated FROM fn_mark_notification_pushed($1::uuid);
