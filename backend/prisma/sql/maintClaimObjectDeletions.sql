-- fn_maint_claim_object_deletions (Schema §7.7, every 5 min).
-- @param {Int} $1:batch
SELECT deletion_id, object_key, is_prefix FROM fn_maint_claim_object_deletions($1::int);
