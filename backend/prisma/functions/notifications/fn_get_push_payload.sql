-- Push worker (BR-NT-03, NT-03): one row per device of the recipient, with what the localised
-- text needs. No rows — nothing to send — when the notification was already pushed or read, is
-- older than 24 hours, the recipient or actor is not ACTIVE, they block each other, or the post /
-- comment is no longer available.
CREATE OR REPLACE FUNCTION fn_get_push_payload(p_notification_id uuid)
RETURNS TABLE (
  recipient_id uuid, recipient_locale varchar, type notification_type, actor_username citext,
  post_id uuid, comment_id uuid,
  installation_id varchar, expo_push_token varchar, platform platform, device_locale varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT r.id, r.locale, n.type, a.username, n.post_id, n.comment_id,
         d.installation_id, d.expo_push_token, d.platform, d.locale
  FROM notifications n
  JOIN users r ON r.id = n.recipient_id AND r.status = 'ACTIVE'
  JOIN users a ON a.id = n.actor_id AND a.status = 'ACTIVE'
  JOIN device_push_tokens d ON d.user_id = n.recipient_id
  LEFT JOIN posts p ON p.id = n.post_id
  LEFT JOIN comments k ON k.id = n.comment_id
  WHERE n.id = p_notification_id
    AND n.pushed_at IS NULL
    AND n.read_at IS NULL
    AND n.created_at > now() - INTERVAL '24 hours'
    AND (n.post_id IS NULL OR p.status = 'PUBLISHED')
    AND (n.comment_id IS NULL OR (k.deleted_at IS NULL AND k.hidden_at IS NULL))
    AND NOT fn__is_blocked_either_way(n.recipient_id, n.actor_id)
  ORDER BY d.installation_id;
END $$;
