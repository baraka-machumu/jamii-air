-- fn_request_account_deletion (Schema §7.2): PENDING_DELETION, sessions and push tokens removed.
-- @param {String} $1:viewerId
SELECT deletion_due_at FROM fn_request_account_deletion($1::uuid);
