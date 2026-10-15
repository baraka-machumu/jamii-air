// How every status the portal shows reads, and how it is toned. Kept out of the badge component
// so screens can use the words in a sentence without importing a component.
//
// Status is carried by the text, not the colour: the dashboard's palette check (Plan 4.3
// decisions) settled that Jamii terracotta, danger and warning are too close together to tell
// apart as a categorical set. The tint only groups rows at a glance.

/** Nothing to do, something to do, or something done. */
export type Tone = 'neutral' | 'attention' | 'done';

const STATUSES: Record<string, { label: string; tone: Tone }> = {
  // Reports (App Flow §15.4)
  OPEN: { label: 'Open', tone: 'attention' },
  REVIEWING: { label: 'Reviewing', tone: 'attention' },
  RESOLVED: { label: 'Resolved', tone: 'done' },
  DISMISSED: { label: 'Dismissed', tone: 'neutral' },
  // Users (App Flow §15.5)
  ACTIVE: { label: 'Active', tone: 'done' },
  SUSPENDED: { label: 'Suspended', tone: 'attention' },
  PENDING_DELETION: { label: 'Deletion requested', tone: 'attention' },
  // Posts and comments
  PUBLISHED: { label: 'Published', tone: 'done' },
  PROCESSING: { label: 'Processing', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'attention' },
  HIDDEN: { label: 'Hidden', tone: 'attention' },
  DELETED: { label: 'Deleted', tone: 'neutral' },
  // Invite codes (App Flow §15.6)
  USED_UP: { label: 'Used up', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
  REVOKED: { label: 'Revoked', tone: 'neutral' },
  // Admin accounts (App Flow §15.8)
  DISABLED: { label: 'Disabled', tone: 'neutral' },
};

/**
 * An unknown status is shown as it came rather than hidden: a status the portal does not know
 * about is exactly what a moderator needs to see.
 */
export const statusLabel = (status: string): string => STATUSES[status]?.label ?? status;

export const statusTone = (status: string): Tone => STATUSES[status]?.tone ?? 'neutral';
