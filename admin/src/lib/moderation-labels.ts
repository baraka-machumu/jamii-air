// What a logged action reads as. The moderation history and the audit log show the same words for
// the same action, so a moderator does not have to learn two vocabularies.

const ACTIONS: Record<string, string> = {
  HIDE_POST: 'Hid a post',
  UNHIDE_POST: 'Restored a post',
  HIDE_COMMENT: 'Hid a comment',
  UNHIDE_COMMENT: 'Restored a comment',
  SUSPEND_USER: 'Suspended the account',
  REINSTATE_USER: 'Reinstated the account',
  REVOKE_SESSIONS: 'Signed the account out everywhere',
  RESOLVE_REPORT: 'Resolved a report',
  DISMISS_REPORT: 'Dismissed a report',
  INVITE_CREATED: 'Created an invite code',
  INVITE_REVOKED: 'Revoked an invite code',
  ADMIN_CREATED: 'Added an admin',
  ADMIN_UPDATED: 'Changed an admin',
  ADMIN_TOTP_RESET: 'Reset an admin’s 2FA',
  ADMIN_LOGIN: 'Signed in',
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
