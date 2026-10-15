// A post as a moderator sees it (Plan 4.4). Reached from a report, from the author's page or from
// a link in the audit log, and it is where a post is hidden or restored outside of a report.
//
// The photo is blurred until asked for, the same as in a report: the reason this page is open is
// usually that someone complained about what is in it.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useModerationAction } from '@/api/moderation';
import { usePost } from '@/api/posts';
import { reasonLabel } from '@/api/reports';
import { BlurredMedia } from '@/components/BlurredMedia';
import { ErrorBanner } from '@/components/ErrorBanner';
import { NoteDialog } from '@/components/NoteDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { statusLabel } from '@/lib/status';
import { showToast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { ageSince, count } from '@/lib/format';
import { ModerationList } from '@/components/ModerationList';
import { when } from '@/lib/moderation-labels';

export default function Post() {
  const { id = '' } = useParams();
  const post = usePost(id);
  const [asking, setAsking] = useState(false);
  const data = post.data;
  const hidden = data?.status === 'HIDDEN';
  const action = useModerationAction(hidden ? 'unhidePost' : 'hidePost', id);

  if (post.isPending) return <p className="text-muted-foreground">Loading the post…</p>;
  if (post.isError || !data) return <ErrorBanner error={post.error} onRetry={() => void post.refetch()} />;

  const media = data.media ?? [];
  const reports = data.reports ?? [];
  const canModerate = data.status === 'PUBLISHED' || data.status === 'HIDDEN';

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Post</h1>
        <StatusBadge status={data.status} />
      </div>
      <p className="mt-1 text-muted-foreground">
        by{' '}
        <Link className="text-primary underline-offset-4 hover:underline" to={`/users/${data.authorId}`}>
          @{data.authorUsername}
        </Link>
        {data.authorStatus !== 'ACTIVE' && <StatusBadge className="ml-2" status={data.authorStatus} />}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            {media.length ? media.map((item) => (
              <BlurredMedia
                key={item.id}
                src={item.feedUrl ?? item.thumbUrl ?? ''}
                alt="The post’s photo"
                className="mb-3 max-h-[480px]"
              />
            )) : (
              <p className="text-muted-foreground">No photo (it may have failed to process).</p>
            )}
            {data.caption && <p className="whitespace-pre-wrap">{data.caption}</p>}
            <p className="mt-3 text-muted-foreground tabular-nums">
              {count(data.likeCount)} likes · {count(data.commentCount)} comments · posted {when(data.createdAt)}
              {data.hiddenAt && ` · hidden ${when(data.hiddenAt)}`}
              {data.deletedAt && ` · deleted by the author ${when(data.deletedAt)}`}
            </p>
          </Card>

          {!!reports.length && (
            <Card className="p-4">
              <h2 className="font-semibold">Reports about this post</h2>
              <Table className="mt-3">
                <thead>
                  <tr><Th>Filed</Th><Th>Reason</Th><Th>By</Th><Th>Status</Th></tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.reportId}>
                      <Td className="whitespace-nowrap">
                        <Link className="text-primary underline-offset-4 hover:underline" to={`/reports/${report.reportId}`}>
                          {ageSince(report.createdAt)} ago
                        </Link>
                      </Td>
                      <Td>{reasonLabel(report.reason)}</Td>
                      <Td className="text-muted-foreground">{report.reporterUsername ? `@${report.reporterUsername}` : '—'}</Td>
                      <Td><StatusBadge status={report.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="font-semibold">Moderation history</h2>
            {data.moderationHistory?.length
              ? <ModerationList entries={data.moderationHistory} />
              : <p className="mt-2 text-muted-foreground">Nothing has been done to this post.</p>}
          </Card>
        </div>

        <Card className="h-fit p-4">
          <h2 className="font-semibold">Actions</h2>
          {canModerate ? (
            <Button
              className="mt-3 w-full"
              variant={hidden ? 'outline' : 'destructive'}
              onClick={() => setAsking(true)}
            >
              {hidden ? 'Restore the post' : 'Hide the post'}
            </Button>
          ) : (
            <p className="mt-2 text-muted-foreground">
              A post that is {statusLabel(data.status).toLowerCase()} cannot be hidden or restored.
            </p>
          )}
        </Card>
      </div>

      {asking && (
        <NoteDialog
          title={hidden ? 'Restore this post?' : 'Hide this post?'}
          description={hidden
            ? 'It becomes visible to everyone in the app again.'
            : 'It disappears for everyone in the app. The author is not told.'}
          confirmLabel={hidden ? 'Restore' : 'Hide'}
          destructive={!hidden}
          pending={action.isPending}
          error={action.error}
          onClose={() => setAsking(false)}
          onConfirm={({ note }) => action.mutate({ note }, {
            onSuccess: () => {
              setAsking(false);
              showToast(hidden ? 'Post restored' : 'Post hidden');
            },
          })}
        />
      )}
    </section>
  );
}
