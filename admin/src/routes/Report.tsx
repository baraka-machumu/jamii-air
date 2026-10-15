// One report (Plan 4.4, App Flow §15.4 steps 2-4): what was reported, by whom, for what, what
// else has been reported about the same target, and the reported account's moderation history -
// then the decision.
//
// Opening a report moves it to REVIEWING, so two moderators can see that someone is already on it
// (App Flow §15.4 step 2). That is a side effect of arriving, not of a button, so it runs once per
// report and deliberately does not refresh the queue underneath: a list that reorders while a
// moderator reads is worse than a queue that is a few seconds stale.
//
// Every action takes a reason note, and hiding or suspending offers to resolve the report in the
// same call, which is what step 3a means by "report can be marked Resolved in the same dialog".
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/errors';
import { type ModerationActionName, useModerationAction } from '@/api/moderation';
import {
  type ReportDetail, reasonLabel, targetId, targetLabel, useReport, useUpdateReport,
} from '@/api/reports';
import type { components } from '@/api/schema';
import { BlurredMedia } from '@/components/BlurredMedia';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ModerationList } from '@/components/ModerationList';
import { NoteDialog } from '@/components/NoteDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { showToast } from '@/lib/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, Td, Th } from '@/components/ui/table';
import { ageSince } from '@/lib/format';
import { when } from '@/lib/moderation-labels';

/** The target as the API sends it: one schema covering a post, a comment or an account. */
type Target = components['schemas']['ReportTarget'];

/** A dialog waiting for a note: a moderation action, or closing the report. */
type Pending =
  | { kind: 'moderation'; action: ModerationActionName; id: string; title: string; description: ReactNode; confirmLabel: string; destructive?: boolean; closes?: boolean }
  | { kind: 'decision'; status: 'RESOLVED' | 'DISMISSED' };

export default function Report() {
  const { id = '' } = useParams();
  const report = useReport(id);
  const decide = useUpdateReport(id);
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  /** Set when the server says another admin closed this report first (App Flow §15.9). */
  const [conflict, setConflict] = useState(false);

  // Opening the report puts it in REVIEWING. Keyed by report id, so arriving at a second report
  // from this one marks that one too, and a refetch of the same report does not re-send it.
  const marked = useRef<string | null>(null);
  const data = report.data;
  useEffect(() => {
    if (!data || data.status !== 'OPEN' || marked.current === id) return;
    marked.current = id;
    decide.mutate({ status: 'REVIEWING' });
  }, [data, id, decide]);

  if (report.isPending) {
    return <p className="text-muted-foreground">Loading the report…</p>;
  }
  if (report.isError || !data) {
    return (
      <section>
        <BackLink />
        <ErrorBanner error={report.error} onRetry={() => void report.refetch()} />
      </section>
    );
  }

  const target = data.target;
  const closed = data.status === 'RESOLVED' || data.status === 'DISMISSED';

  /** A failed action: a 409 means someone else got there first, anything else is just an error. */
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'REPORT_ALREADY_HANDLED') {
      setConflict(true);
      setPending(null);
      void report.refetch();
    }
  };

  const done = (message: string) => {
    setPending(null);
    showToast(message);
    // Closing a report sends the moderator back to the queue, at the next oldest one
    // (App Flow §15.4 step 4). An action that left the report open keeps them here.
    if (message.startsWith('Report')) void navigate('/reports');
  };

  return (
    <section>
      <BackLink />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {targetLabel(data.targetType)} reported for {reasonLabel(data.reason).toLowerCase()}
        </h1>
        <StatusBadge status={data.status} />
      </div>

      {conflict && (
        <Card className="mt-4 border-warning/40 bg-warning/10 p-4">
          <p role="alert">
            {data.resolvedByName
              ? `This report was already handled by ${data.resolvedByName}.`
              : 'This report was already handled by another admin.'}
            {' '}The page now shows what they decided.
          </p>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">Reported content</h2>
            <TargetPreview type={data.targetType} target={target} reason={data.reason} />
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">The report</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Row label="Reason">{reasonLabel(data.reason)}</Row>
              <Row label="Reported by">
                <Link className="text-primary underline-offset-4 hover:underline" to={`/users/${data.reporterId}`}>
                  @{data.reporterUsername}
                </Link>
              </Row>
              <Row label="Waiting">{ageSince(data.createdAt)}</Row>
              <Row label="Filed">{when(data.createdAt)}</Row>
              {closed && <Row label="Closed by">{data.resolvedByName ?? '—'}</Row>}
              {closed && data.resolvedAt && <Row label="Closed">{when(data.resolvedAt)}</Row>}
            </dl>
            {data.details && (
              <>
                <h3 className="mt-4 font-medium">What they said</h3>
                {/* The reporter's own words, so they are quoted rather than restyled. */}
                <blockquote className="mt-1 whitespace-pre-wrap border-l-2 pl-3 text-muted-foreground">
                  {data.details}
                </blockquote>
              </>
            )}
          </Card>

          <OtherReports report={data} />
          <History report={data} />
        </div>

        <div className="space-y-4">
          <ReportedAccount report={data} />

          <Card className="p-4">
            <h2 className="font-semibold">Decide</h2>
            {closed ? (
              <p className="mt-2 text-muted-foreground">
                This report is {data.status === 'RESOLVED' ? 'resolved' : 'dismissed'}. Content can still
                be restored, and a suspended account reinstated, from its own page.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <Actions
                  report={data}
                  target={target}
                  onPick={(next) => { setConflict(false); setPending(next); }}
                />
              </div>
            )}
          </Card>
        </div>
      </div>

      {pending?.kind === 'decision' && (
        <DecisionDialog
          status={pending.status}
          decide={decide}
          onError={onError}
          onDone={() => done(pending.status === 'RESOLVED' ? 'Report resolved' : 'Report dismissed')}
          onClose={() => setPending(null)}
        />
      )}

      {pending?.kind === 'moderation' && (
        <ModerationDialog
          pending={pending}
          reportId={closed ? undefined : data.reportId}
          onError={onError}
          onDone={(alsoClosed) => done(alsoClosed ? 'Report resolved' : `${pending.confirmLabel} — done`)}
          onClose={() => setPending(null)}
        />
      )}
    </section>
  );
}

/** The actions this report's target allows, in the order App Flow §15.4 step 3 lists them. */
function Actions({ report, target, onPick }: {
  report: ReportDetail;
  target: Target;
  onPick: (pending: Pending) => void;
}) {
  const contentId = targetId(report);
  const hidden = !!target.hiddenAt;
  const deleted = !!target.deletedAt;
  const suspended = report.reportedUserStatus === 'SUSPENDED';
  const who = `@${report.reportedUsername}`;

  return (
    <>
      {report.targetType !== 'USER' && contentId && !deleted && (
        <Button
          variant={hidden ? 'outline' : 'destructive'}
          onClick={() => onPick({
            kind: 'moderation',
            action: report.targetType === 'POST'
              ? (hidden ? 'unhidePost' : 'hidePost')
              : (hidden ? 'unhideComment' : 'hideComment'),
            id: contentId,
            title: hidden
              ? `Restore this ${report.targetType.toLowerCase()}?`
              : `Hide this ${report.targetType.toLowerCase()}?`,
            description: hidden
              ? 'It becomes visible to everyone in the app again.'
              : 'It disappears for everyone in the app. The author is not told.',
            confirmLabel: hidden ? 'Restore' : 'Hide',
            destructive: !hidden,
            closes: !hidden,
          })}
        >
          {hidden ? `Restore ${report.targetType.toLowerCase()}` : `Hide ${report.targetType.toLowerCase()}`}
        </Button>
      )}

      <Button
        variant={suspended ? 'outline' : 'destructive'}
        onClick={() => onPick({
          kind: 'moderation',
          action: suspended ? 'reinstateUser' : 'suspendUser',
          id: report.reportedUserId,
          title: suspended ? `Reinstate ${who}?` : `Suspend ${who}?`,
          description: suspended
            ? 'They can sign in again and their content comes back.'
            : 'This logs them out and hides their content. They see a suspension message on their next request.',
          confirmLabel: suspended ? 'Reinstate' : 'Suspend',
          destructive: !suspended,
          closes: !suspended,
        })}
      >
        {suspended ? `Reinstate ${who}` : `Suspend ${who}`}
      </Button>

      <div className="mt-2 flex gap-2 border-t pt-3">
        <Button className="flex-1" onClick={() => onPick({ kind: 'decision', status: 'RESOLVED' })}>
          Resolve
        </Button>
        <Button className="flex-1" variant="outline" onClick={() => onPick({ kind: 'decision', status: 'DISMISSED' })}>
          Dismiss
        </Button>
      </div>
      <p className="text-muted-foreground">
        Resolve once the content or account has been dealt with. Dismiss if there is nothing wrong.
      </p>
    </>
  );
}

/** Resolve or dismiss: a note and nothing else to decide. */
function DecisionDialog({ status, decide, onError, onDone, onClose }: {
  status: 'RESOLVED' | 'DISMISSED';
  decide: ReturnType<typeof useUpdateReport>;
  onError: (error: unknown) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  return (
    <NoteDialog
      title={status === 'RESOLVED' ? 'Resolve this report?' : 'Dismiss this report?'}
      description={status === 'RESOLVED'
        ? 'The report is closed as handled. Nothing changes for the content or the account.'
        : 'The report is closed with no action. Nothing changes for the content or the account.'}
      confirmLabel={status === 'RESOLVED' ? 'Resolve' : 'Dismiss'}
      pending={decide.isPending}
      error={decide.error}
      onClose={onClose}
      onConfirm={({ note }) => decide.mutate({ status, note }, { onSuccess: onDone, onError })}
    />
  );
}

/** Hide, restore, suspend or reinstate - with the option to close the report in the same call. */
function ModerationDialog({ pending, reportId, onError, onDone, onClose }: {
  pending: Extract<Pending, { kind: 'moderation' }>;
  /** Undefined once the report is closed: there is nothing left to close. */
  reportId?: string;
  onError: (error: unknown) => void;
  onDone: (closedReport: boolean) => void;
  onClose: () => void;
}) {
  const action = useModerationAction(pending.action, pending.id);
  // Offered, and on by default, only where closing the report is the natural next step: hiding the
  // content or suspending the account answers the report, restoring one does not.
  const canClose = !!reportId && !!pending.closes;
  const [alsoClose, setAlsoClose] = useState(true);
  const closing = canClose && alsoClose;

  return (
    <NoteDialog
      title={pending.title}
      description={pending.description}
      confirmLabel={pending.confirmLabel}
      destructive={pending.destructive}
      pending={action.isPending}
      error={action.error}
      extra={canClose ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={alsoClose}
            onChange={(event) => setAlsoClose(event.target.checked)}
          />
          Resolve the report as well
        </label>
      ) : undefined}
      onClose={onClose}
      onConfirm={({ note }) => action.mutate(
        { note, ...(closing ? { reportId } : {}) },
        { onSuccess: () => onDone(closing), onError },
      )}
    />
  );
}

function TargetPreview({ type, target, reason }: { type: string; target: Target; reason: string }) {
  const gone = target.deletedAt
    ? 'The author has deleted this.'
    : target.hiddenAt ? 'Hidden by a moderator.' : null;

  return (
    <div className="mt-3 space-y-3">
      {gone && <p className="text-muted-foreground">{gone}</p>}

      {type === 'POST' && (
        <>
          {target.feedUrl || target.thumbUrl ? (
            <BlurredMedia
              src={target.feedUrl ?? target.thumbUrl ?? ''}
              alt="The reported photo"
              reason={reasonLabel(reason)}
              className="max-h-[420px]"
            />
          ) : (
            <p className="text-muted-foreground">No photo to show (it may still be processing).</p>
          )}
          {target.caption && <p className="whitespace-pre-wrap">{target.caption}</p>}
          <Meta target={target} />
          {target.postId && (
            <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to={`/posts/${target.postId}`}>
              Open the post
            </Link>
          )}
        </>
      )}

      {type === 'COMMENT' && (
        <>
          {/* A comment is text: it needs no blur, and quoting it keeps it clearly someone else's. */}
          <blockquote className="whitespace-pre-wrap rounded-md border-l-2 bg-secondary/40 p-3">
            {target.body ?? '—'}
          </blockquote>
          <Meta target={target} />
          {target.postId && (
            <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to={`/posts/${target.postId}`}>
              Open the post it is on
            </Link>
          )}
        </>
      )}

      {type === 'USER' && (
        <>
          <p className="text-muted-foreground">
            The whole account was reported, not one piece of content.
          </p>
          {target.bio && <p className="whitespace-pre-wrap">{target.bio}</p>}
          <p className="text-muted-foreground">{target.postCount ?? 0} posts</p>
        </>
      )}
    </div>
  );
}

function Meta({ target }: { target: Target }) {
  return (
    <p className="text-muted-foreground">
      {target.status && <StatusBadge className="mr-2" status={target.status} />}
      {target.createdAt ? `Posted ${when(target.createdAt)}` : null}
    </p>
  );
}

function ReportedAccount({ report }: { report: ReportDetail }) {
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Reported account</h2>
      <div className="mt-3 flex items-center gap-3">
        {report.reportedAvatarUrl ? (
          <img src={report.reportedAvatarUrl} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <span className="size-10 rounded-full bg-secondary" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{report.reportedDisplayName ?? report.reportedUsername}</p>
          <p className="truncate text-muted-foreground">@{report.reportedUsername}</p>
        </div>
      </div>
      <p className="mt-3"><StatusBadge status={report.reportedUserStatus} /></p>
      <Link
        className={`mt-3 ${buttonVariants({ variant: 'outline', size: 'sm' })}`}
        to={`/users/${report.reportedUserId}`}
      >
        Open the account
      </Link>
    </Card>
  );
}

function OtherReports({ report }: { report: ReportDetail }) {
  const others = report.otherReports ?? [];
  if (!others.length) return null;

  return (
    <Card className="p-4">
      <h2 className="font-semibold">Other reports on the same target</h2>
      <Table className="mt-3">
        <thead>
          <tr><Th>Filed</Th><Th>Reason</Th><Th>By</Th><Th>Status</Th></tr>
        </thead>
        <tbody>
          {others.map((other) => (
            <tr key={other.reportId}>
              <Td className="whitespace-nowrap">
                <Link className="text-primary underline-offset-4 hover:underline" to={`/reports/${other.reportId}`}>
                  {ageSince(other.createdAt)} ago
                </Link>
              </Td>
              <Td>{reasonLabel(other.reason)}</Td>
              <Td className="text-muted-foreground">{other.reporterUsername ? `@${other.reporterUsername}` : '—'}</Td>
              <Td><StatusBadge status={other.status} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function History({ report }: { report: ReportDetail }) {
  const history = report.userHistory ?? [];

  return (
    <Card className="p-4">
      <h2 className="font-semibold">What has happened to this account before</h2>
      {history.length ? (
        <ModerationList entries={history} />
      ) : (
        <p className="mt-2 text-muted-foreground">Nothing has been actioned on this account before.</p>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/reports" className="text-primary underline-offset-4 hover:underline">
      ← Back to the queue
    </Link>
  );
}
