// One account (Plan 4.5, App Flow §15.5): who they are, what state the account is in, what they
// have posted, what has been reported about them and what has been done to them before - then
// Suspend / Reinstate and Revoke all sessions.
//
// The date of birth is deliberately not here. App Flow §15.5 asks only that the account is
// confirmed 18+, which registration already enforced with a CHECK constraint (Plan 1.4), so the
// page says "confirmed 18+" and the birth date stays out of a moderation screen.
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { type ModerationActionName, useModerationAction } from '@/api/moderation';
import { reasonLabel } from '@/api/reports';
import { useUser } from '@/api/users';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ModerationList } from '@/components/ModerationList';
import { NoteDialog } from '@/components/NoteDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { ageSince, count } from '@/lib/format';
import { when } from '@/lib/moderation-labels';
import { showToast } from '@/lib/toast';

/** A dialog waiting for a note, and what to say once it has gone through. */
interface Pending {
  action: ModerationActionName;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  done: string;
}

export default function User() {
  const { id = '' } = useParams();
  const user = useUser(id);
  const [pending, setPending] = useState<Pending | null>(null);
  const data = user.data;

  if (user.isPending) return <p className="text-muted-foreground">Loading the account…</p>;
  if (user.isError || !data) return <ErrorBanner error={user.error} onRetry={() => void user.refetch()} />;

  const suspended = data.status === 'SUSPENDED';
  const who = `@${data.username}`;

  return (
    <section>
      <Link to="/users" className="text-primary underline-offset-4 hover:underline">← Back to users</Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {data.avatarUrl ? (
          <img src={data.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <span className="size-12 rounded-full bg-secondary" aria-hidden="true" />
        )}
        <div>
          <h1 className="text-xl font-semibold">{data.displayName ?? data.username}</h1>
          <p className="text-muted-foreground">{who}</p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">Account</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Row label="Email">{data.email}</Row>
              <Row label="Joined">{when(data.createdAt)}</Row>
              <Row label="Age">Confirmed 18+ at sign-up</Row>
              <Row label="Language">{data.locale === 'sw' ? 'Swahili' : 'English'}</Row>
              <Row label="Invited with">{data.inviteCode ?? '—'}</Row>
              <Row label="Last active">{data.lastActiveAt ? `${ageSince(data.lastActiveAt)} ago` : 'never'}</Row>
              {data.suspendedAt && <Row label="Suspended">{when(data.suspendedAt)}</Row>}
              {data.deletionRequestedAt && (
                <Row label="Deletion requested">{when(data.deletionRequestedAt)}</Row>
              )}
            </dl>
            {data.bio && <p className="mt-3 whitespace-pre-wrap">{data.bio}</p>}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Recent posts</h2>
            {data.recentPosts?.length ? (
              // Hidden and failed posts are in here too, badged: a grid that quietly left them out
              // would hide exactly what a moderator came to check.
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {data.recentPosts.map((post) => (
                  <li key={post.postId} className="relative">
                    <Link to={`/posts/${post.postId}`} className="block">
                      {post.thumbUrl ? (
                        <img src={post.thumbUrl} alt={post.caption ?? 'A post'} className="aspect-square w-full rounded-md object-cover" />
                      ) : (
                        <span className="block aspect-square w-full rounded-md bg-secondary" />
                      )}
                      {post.status !== 'PUBLISHED' && (
                        <StatusBadge className="absolute left-1 top-1" status={post.status} />
                      )}
                      <span className="sr-only">{`${post.likeCount} likes, ${post.commentCount} comments`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted-foreground">They have not posted anything.</p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Reports against them</h2>
            {data.reportsAgainst?.length ? (
              <Table className="mt-3">
                <thead>
                  <tr><Th>Filed</Th><Th>About</Th><Th>Reason</Th><Th>Status</Th></tr>
                </thead>
                <tbody>
                  {data.reportsAgainst.map((report) => (
                    <tr key={report.reportId}>
                      <Td className="whitespace-nowrap">
                        <Link className="text-primary underline-offset-4 hover:underline" to={`/reports/${report.reportId}`}>
                          {ageSince(report.createdAt)} ago
                        </Link>
                      </Td>
                      <Td>{report.targetType ? report.targetType.toLowerCase() : '—'}</Td>
                      <Td>{reasonLabel(report.reason)}</Td>
                      <Td><StatusBadge status={report.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="mt-2 text-muted-foreground">Nobody has reported this account.</p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Moderation history</h2>
            {data.moderationHistory?.length
              ? <ModerationList entries={data.moderationHistory} />
              : <p className="mt-2 text-muted-foreground">Nothing has been done to this account.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">Numbers</h2>
            <dl className="mt-2 space-y-2">
              <Row label="Posts">{count(data.postCount)}</Row>
              <Row label="Followers">{count(data.followerCount)}</Row>
              <Row label="Following">{count(data.followingCount)}</Row>
              <Row label="Reports they filed">{count(data.reportsFiled)}</Row>
              <Row label="Signed in on">
                {data.activeSessions === 1 ? '1 device' : `${count(data.activeSessions)} devices`}
              </Row>
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Actions</h2>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant={suspended ? 'outline' : 'destructive'}
                onClick={() => setPending(suspended ? {
                  action: 'reinstateUser',
                  title: `Reinstate ${who}?`,
                  description: 'They can sign in again and their content comes back.',
                  confirmLabel: 'Reinstate',
                  done: 'Account reinstated',
                } : {
                  action: 'suspendUser',
                  title: `Suspend ${who}?`,
                  description: 'This logs them out and hides their content. They see a suspension message on their next request.',
                  confirmLabel: 'Suspend',
                  destructive: true,
                  done: 'Account suspended',
                })}
              >
                {suspended ? 'Reinstate the account' : 'Suspend the account'}
              </Button>

              <Button
                variant="outline"
                disabled={data.activeSessions === 0}
                onClick={() => setPending({
                  action: 'revokeSessions',
                  title: `Sign ${who} out everywhere?`,
                  description: 'Every device is signed out. They can sign straight back in — this does not suspend the account.',
                  confirmLabel: 'Sign out everywhere',
                  done: 'Signed out on every device',
                })}
              >
                Revoke all sessions
              </Button>
              {data.activeSessions === 0 && (
                <p className="text-muted-foreground">They are not signed in anywhere.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {pending && (
        <ActionDialog
          key={pending.action}
          pending={pending}
          userId={id}
          onClose={() => setPending(null)}
          onDone={() => { setPending(null); showToast(pending.done); }}
        />
      )}
    </section>
  );
}

function ActionDialog({ pending, userId, onClose, onDone }: {
  pending: Pending;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const action = useModerationAction(pending.action, userId);
  return (
    <NoteDialog
      title={pending.title}
      description={pending.description}
      confirmLabel={pending.confirmLabel}
      destructive={pending.destructive}
      pending={action.isPending}
      error={action.error}
      onClose={onClose}
      onConfirm={({ note }) => action.mutate({ note }, { onSuccess: onDone })}
    />
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
