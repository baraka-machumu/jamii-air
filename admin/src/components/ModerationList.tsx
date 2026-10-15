// The moderation history of an account or a post: what was done, by whom, when, and why. Shown on
// a report, on a user and on a post, so it lives on its own.
import { actionLabel, when } from '@/lib/moderation-labels';

export interface HistoryEntry {
  action: string;
  note?: string | null;
  adminName?: string | null;
  createdAt: string;
}

export function ModerationList({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {entries.map((entry, index) => (
        <li key={`${entry.createdAt}-${index}`} className="border-l-2 pl-3">
          <p className="font-medium">{actionLabel(entry.action)}</p>
          <p className="text-muted-foreground">
            {entry.adminName ?? 'An admin'} · {when(entry.createdAt)}
          </p>
          {entry.note && <p className="mt-1 whitespace-pre-wrap">{entry.note}</p>}
        </li>
      ))}
    </ul>
  );
}
