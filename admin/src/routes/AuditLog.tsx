// The audit log (Plan 4.6, App Flow §15.7): read-only, newest first, with the note that every
// moderation action was required to carry. This is what makes the note requirement worth anything.
//
// The admin filter is a list of admins for a super-admin and nothing for a moderator: listing
// admins is a super-admin endpoint (2.12), so a moderator cannot be offered names they are not
// allowed to read. They still have the action, target and date filters.
import { useState } from 'react';
import { Link } from 'react-router';
import { DEFAULT_AUDIT_FILTERS, type AuditFilters, targetPath, useAudit } from '@/api/audit';
import { useAdmins } from '@/api/admins';
import { ErrorBanner } from '@/components/ErrorBanner';
import { SkeletonRows } from '@/components/SkeletonRows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { ADMIN_ACTIONS, MODERATION_ACTIONS, actionLabel, when } from '@/lib/moderation-labels';
import { useSession } from '@/stores/session';

const COLUMNS = 5;

export default function AuditLog() {
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_AUDIT_FILTERS);
  const entries = useAudit(filters);
  const isSuperAdmin = useSession((s) => s.admin?.role) === 'SUPER_ADMIN';
  // Asked for only where it is allowed: the list is a super-admin endpoint (2.12).
  const admins = useAdmins(isSuperAdmin);
  const rows = entries.data ?? [];
  const filtered = Object.values(filters).some(Boolean);

  const set = (patch: Partial<AuditFilters>) => setFilters({ ...filters, ...patch });

  return (
    <section>
      <h1 className="text-xl font-semibold">Audit log</h1>
      <p className="mt-1 text-muted-foreground">
        Every moderation and admin action, newest first. Nothing here can be changed.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {isSuperAdmin && (
          <div>
            <label htmlFor="audit-admin" className="block text-muted-foreground">Admin</label>
            <Select
              id="audit-admin"
              className="mt-1"
              value={filters.adminId}
              onChange={(event) => set({ adminId: event.target.value })}
            >
              <option value="">Anyone</option>
              {(admins.data ?? []).map((admin) => (
                <option key={admin.adminId} value={admin.adminId}>{admin.displayName}</option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label htmlFor="audit-action" className="block text-muted-foreground">Action</label>
          <Select
            id="audit-action"
            className="mt-1"
            value={filters.action}
            onChange={(event) => set({ action: event.target.value })}
          >
            <option value="">Anything</option>
            <optgroup label="Moderation">
              {MODERATION_ACTIONS.map((action) => (
                <option key={action} value={action}>{actionLabel(action)}</option>
              ))}
            </optgroup>
            <optgroup label="Admin">
              {ADMIN_ACTIONS.map((action) => (
                <option key={action} value={action}>{actionLabel(action)}</option>
              ))}
            </optgroup>
          </Select>
        </div>

        <div>
          <label htmlFor="audit-target" className="block text-muted-foreground">Target id</label>
          <Input
            id="audit-target"
            className="mt-1 w-72"
            value={filters.targetId}
            placeholder="A user, post, report or admin id"
            onChange={(event) => set({ targetId: event.target.value.trim() })}
          />
        </div>

        <div>
          <label htmlFor="audit-from" className="block text-muted-foreground">From</label>
          <Input
            id="audit-from"
            className="mt-1"
            type="date"
            value={filters.from}
            onChange={(event) => set({ from: event.target.value })}
          />
        </div>

        <div>
          <label htmlFor="audit-to" className="block text-muted-foreground">To</label>
          <Input
            id="audit-to"
            className="mt-1"
            type="date"
            value={filters.to}
            onChange={(event) => set({ to: event.target.value })}
          />
        </div>

        {filtered && (
          <Button variant="ghost" onClick={() => setFilters(DEFAULT_AUDIT_FILTERS)}>Clear filters</Button>
        )}
      </div>

      {entries.isError && <ErrorBanner error={entries.error} onRetry={() => void entries.refetch()} />}

      <Table className="mt-4">
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Who</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>Note</Th>
          </tr>
        </thead>
        <tbody>
          {entries.isPending && <SkeletonRows columns={COLUMNS} rows={8} />}

          {!entries.isPending && !rows.length && (
            <tr>
              <Td colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
                {filtered ? 'Nothing matches these filters.' : 'Nothing has been done yet.'}
              </Td>
            </tr>
          )}

          {rows.map((entry) => {
            const path = targetPath(entry);
            return (
              <tr key={entry.entryId}>
                <Td className="whitespace-nowrap text-muted-foreground">{when(entry.createdAt)}</Td>
                <Td className="whitespace-nowrap">{entry.adminName ?? 'An admin'}</Td>
                <Td>{actionLabel(entry.action)}</Td>
                <Td className="whitespace-nowrap">
                  {path ? (
                    <Link className="text-primary underline-offset-4 hover:underline" to={path}>
                      {entry.targetType?.toLowerCase()} {short(entry.targetId)}
                    </Link>
                  ) : entry.targetId ? (
                    <span className="text-muted-foreground">
                      {entry.targetType?.toLowerCase()} {short(entry.targetId)}
                    </span>
                  ) : '—'}
                </Td>
                <Td className="max-w-80 whitespace-pre-wrap">{entry.note ?? '—'}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {entries.hasNextPage && (
        <Button
          className="mt-4"
          variant="outline"
          disabled={entries.isFetchingNextPage}
          onClick={() => void entries.fetchNextPage()}
        >
          {entries.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </section>
  );
}

/** A UUID is unreadable in a table cell; the first block is enough to tell two rows apart. */
function short(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '';
}
