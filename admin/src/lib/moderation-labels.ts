// What a logged action reads as. The moderation history and the audit log show the same words for
// the same action, so a moderator does not have to learn two vocabularies.

/** Moderation actions (`moderation_action_type`), as the history and the audit log read them. */
export const MODERATION_ACTIONS = [
  'HIDE_POST', 'UNHIDE_POST', 'HIDE_COMMENT', 'UNHIDE_COMMENT',
  'SUSPEND_USER', 'REINSTATE_USER', 'REVOKE_USER_SESSIONS',
  'RESOLVE_REPORT', 'DISMISS_REPORT',
] as const;

/** What the admin side writes through `fn__admin_audit`. */
export const ADMIN_ACTIONS = [
  'ADMIN_BOOTSTRAPPED', 'ADMIN_CREATED', 'ADMIN_UPDATED',
  'INVITE_CREATED', 'INVITE_REVOKED',
  'PASSWORD_CHANGED', 'TOTP_ENABLED', 'TOTP_RESET',
] as const;

const ACTIONS: Record<string, string> = {
  HIDE_POST: 'Hid a post',
  UNHIDE_POST: 'Restored a post',
  HIDE_COMMENT: 'Hid a comment',
  UNHIDE_COMMENT: 'Restored a comment',
  SUSPEND_USER: 'Suspended the account',
  REINSTATE_USER: 'Reinstated the account',
  REVOKE_USER_SESSIONS: 'Signed the account out everywhere',
  RESOLVE_REPORT: 'Resolved a report',
  DISMISS_REPORT: 'Dismissed a report',
  INVITE_CREATED: 'Created an invite code',
  INVITE_REVOKED: 'Revoked an invite code',
  ADMIN_BOOTSTRAPPED: 'Created the first super-admin',
  ADMIN_CREATED: 'Added an admin',
  ADMIN_UPDATED: 'Changed an admin',
  PASSWORD_CHANGED: 'Changed their own password',
  TOTP_ENABLED: 'Set up their own 2FA',
  TOTP_RESET: 'Reset an admin’s 2FA',
};

/** An action the portal has no words for is shown unpicked rather than hidden. */
export const actionLabel = (action: string): string =>
  ACTIONS[action] ?? action.toLowerCase().replace(/_/g, ' ');

/** A timestamp a moderator can quote in a note: "15 Oct 2026, 14:05". */
export function when(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
