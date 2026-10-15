// The users list (Plan 4.5, App Flow §15.5): search by username, display name or email, filtered
// by status.
//
// An admin lands here from the dashboard's "suspended users" tile or to look someone up by name,
// so the search box has the focus-worthy position and the accounts with open reports against them
// carry that count: it is the column that decides whether this account needs attention.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEFAULT_USER_FILTERS, type UserFilters, USER_STATUSES, useDebounced, useUsers,
} from '@/api/users';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';
import { SkeletonRows } from '@/components/SkeletonRows';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { ageSince, count } from '@/lib/format';
import { statusLabel } from '@/lib/status';

const COLUMNS = 6;

export default function Users() {
  const [typed, setTyped] = useState(DEFAULT_USER_FILTERS.q);
  const [status, setStatus] = useState<UserFilters['status']>(DEFAULT_USER_FILTERS.status);
  const q = useDebounced(typed.trim());
  const users = useUsers({ q, status });
  const rows = users.data ?? [];

  return (
    <section>
      <PageHeader
        title="Users"
        description="Everyone who has an account. Search by username, display name or email."
      />

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="user-search" className="block text-muted-foreground">Search</label>
          <Input
            id="user-search"
            className="mt-1"
            type="search"
            value={typed}
            placeholder="Username, name or email"
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="user-status" className="block text-muted-foreground">Status</label>
          <Select
            id="user-status"
            className="mt-1"
            value={status}
            onChange={(event) => setStatus(event.target.value as UserFilters['status'])}
          >
            <option value="ANY">Any</option>
            {USER_STATUSES.map((option) => (
              <option key={option} value={option}>{statusLabel(option)}</option>
            ))}
          </Select>
        </div>
      </div>

      {users.isError && <ErrorBanner error={users.error} onRetry={() => void users.refetch()} />}

      <Table className="mt-4">
        <thead>
          <tr>
            <Th>Account</Th>
            <Th>Status</Th>
            <Th>Posts</Th>
            <Th>Followers</Th>
            <Th>Open reports</Th>
            <Th>Last active</Th>
          </tr>
        </thead>
        <tbody>
          {users.isPending && <SkeletonRows columns={COLUMNS} />}

          {!users.isPending && !rows.length && (
            <tr>
              <Td colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
                {q ? `No account matches “${q}”.` : 'No accounts yet.'}
              </Td>
            </tr>
          )}

          {rows.map((user) => (
            <tr key={user.userId} className="focus-within:bg-secondary/60 hover:bg-secondary/40">
              <Td>
                <Link
                  to={`/users/${user.userId}`}
                  className="flex items-center gap-2 text-primary underline-offset-4 hover:underline"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <span className="size-7 rounded-full bg-secondary" aria-hidden="true" />
                  )}
                  <span className="font-medium">@{user.username}</span>
                </Link>
                {user.displayName && <p className="ml-9 text-muted-foreground">{user.displayName}</p>}
              </Td>
              <Td><StatusBadge status={user.status} /></Td>
              <Numeric>{count(user.postCount)}</Numeric>
              <Numeric>{count(user.followerCount)}</Numeric>
              <Numeric>
                {user.openReports > 0
                  ? <span className="font-medium">{count(user.openReports)}</span>
                  : <span className="text-muted-foreground">—</span>}
              </Numeric>
              <Td className="whitespace-nowrap text-muted-foreground">
                {user.lastActiveAt ? `${ageSince(user.lastActiveAt)} ago` : 'never'}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {users.hasNextPage && (
        <Button
          className="mt-4"
          variant="outline"
          disabled={users.isFetchingNextPage}
          onClick={() => void users.fetchNextPage()}
        >
          {users.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </section>
  );
}

function Numeric({ children }: { children: ReactNode }) {
  return <Td className="tabular-nums">{children}</Td>;
}
