-- fn_get_push_payload (Schema §7.6, push worker): one row per device; none = nothing to send.
-- @param {String} $1:notificationId
SELECT recipient_id, recipient_locale, type::text AS type, actor_username::text AS actor_username, post_id, comment_id,
       installation_id, expo_push_token, platform::text AS platform, device_locale
FROM fn_get_push_payload($1::uuid);
