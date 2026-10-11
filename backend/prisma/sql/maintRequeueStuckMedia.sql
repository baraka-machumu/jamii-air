-- fn_maint_requeue_stuck_media (Schema §7.7, every 10 min): media ids to re-enqueue.
-- @param {Int} $1:batch
SELECT media_id FROM fn_maint_requeue_stuck_media($1::int);
