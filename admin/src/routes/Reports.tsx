// The report queue (Plan 4.4, App Flow §15.4 step 1). The screen the portal exists for, so it is
// built to be worked through rather than browsed: Open reports, oldest first, with how long each
// has waited in the first column.
//
// `j` / `k` move down and up the queue and Enter opens the highlighted report. That is done by
// moving focus to each row's own link rather than tracking a selected index: the browser then
// gives Enter, the focus ring and the screen-reader announcement for free, and a row stays
// reachable by Tab for an admin who does not know the shortcuts.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEFAULT_FILTERS, type ReportFilters, REPORT_REASONS, REPORT_STATUSES, TARGET_TYPES,
  reasonLabel, targetLabel, useReports,
} from '@/api/reports';
import { ErrorBanner } from '@/components/ErrorBanner';
import { SkeletonRows } from '@/components/SkeletonRows';
import { StatusBadge } from '@/components/StatusBadge';
import { statusLabel } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, Td, Th } from '@/components/ui/table';
import { ageSince } from '@/lib/format';

const COLUMNS = 7;

export default function Reports() {
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const reports = useReports(filters);

  // The API has no reason filter, so it is applied here, over the pages already loaded.
  const rows = (reports.data ?? []).filter(
    (report) => filters.reason === 'ANY' || report.reason === filters.reason,
  );

  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const move = useCallback((step: 1 | -1) => {
    const list = links.current.filter((node): node is HTMLAnchorElement => !!node);
    if (!list.length) return;
    const current = list.indexOf(document.activeElement as HTMLAnchorElement);
    // Nothing in the queue focused yet: `j` starts at the top, `k` at the bottom.
    const next = current === -1 ? (step === 1 ? 0 : list.length - 1) : current + step;
    list[Math.min(Math.max(next, 0), list.length - 1)]?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'j' && event.key !== 'k') return;
      // Never while typing in a filter, and never as part of a shortcut that means something else.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      move(event.key === 'j' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  const unfiltered = filters.status === 'OPEN' && filters.type === 'ANY' && filters.reason === 'ANY';

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="mt-1 text-muted-foreground">
            Oldest first. Press <Key>j</Key> and <Key>k</Key> to move through the queue, <Key>Enter</Key> to open one.
          </p>
        </div>
        <Filters filters={filters} onChange={setFilters} />
      </div>

      {reports.isError && <ErrorBanner error={reports.error} onRetry={() => void reports.refetch()} />}

      <Table className="mt-4">
        <thead>
          <tr>
            <Th>Waiting</Th>
            <Th>Type</Th>
            <Th>Reason</Th>
            <Th>Reported</Th>
            <Th>Reported by</Th>
            <Th>Status</Th>
            <Th>On this target</Th>
          </tr>
        </thead>
        <tbody>
          {reports.isPending && <SkeletonRows columns={COLUMNS} />}

          {!reports.isPending && !rows.length && (
            <tr>
              <Td colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
                {unfiltered ? 'No open reports 🎉' : 'No reports match these filters.'}
              </Td>
            </tr>
          )}

          {rows.map((report, index) => (
            <tr key={report.reportId} className="focus-within:bg-secondary/60 hover:bg-secondary/40">
              <Td className="whitespace-nowrap">
                {/* The whole row is one link target: the first cell carries it, and the cells after
                    it are read as that row's detail rather than as six more links. */}
                <Link
                  ref={(node) => { links.current[index] = node; }}
                  to={`/reports/${report.reportId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {ageSince(report.createdAt)}
                  <span className="sr-only">
                    {` — ${targetLabel(report.targetType)} reported for ${reasonLabel(report.reason)}, ${statusLabel(report.status)}`}
                  </span>
                </Link>
              </Td>
              <Td>{targetLabel(report.targetType)}</Td>
              <Td>{reasonLabel(report.reason)}</Td>
              <Td>
                <span className="font-medium">@{report.reportedUsername}</span>
                {report.reportedUserStatus !== 'ACTIVE' && (
                  <StatusBadge className="ml-2" status={report.reportedUserStatus} />
                )}
              </Td>
              <Td className="text-muted-foreground">@{report.reporterUsername}</Td>
              <Td><StatusBadge status={report.status} /></Td>
              <Td className="tabular-nums">
                {report.openReportsOnTarget > 1 ? `${report.openReportsOnTarget} open` : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {reports.hasNextPage && (
        <Button
          className="mt-4"
          variant="outline"
          disabled={reports.isFetchingNextPage}
          onClick={() => void reports.fetchNextPage()}
        >
          {reports.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}

      {filters.reason !== 'ANY' && (
        <p className="mt-3 text-muted-foreground">
          The reason filter applies to the {reports.data?.length ?? 0} reports loaded so far. Load more
          to search further back.
        </p>
      )}
    </section>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-secondary px-1 font-sans text-xs">{children}</kbd>;
}

function Filters({ filters, onChange }: {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Labelled id="filter-status" label="Status">
        <Select
          id="filter-status"
          value={filters.status}
          onChange={(event) => onChange({ ...filters, status: event.target.value as ReportFilters['status'] })}
        >
          <option value="ANY">Any</option>
          {REPORT_STATUSES.map((status) => (
            <option key={status} value={status}>{statusLabel(status)}</option>
          ))}
        </Select>
      </Labelled>

      <Labelled id="filter-type" label="Type">
        <Select
          id="filter-type"
          value={filters.type}
          onChange={(event) => onChange({ ...filters, type: event.target.value as ReportFilters['type'] })}
        >
          <option value="ANY">Any</option>
          {TARGET_TYPES.map((type) => (
            <option key={type} value={type}>{targetLabel(type)}</option>
          ))}
        </Select>
      </Labelled>

      <Labelled id="filter-reason" label="Reason">
        <Select
          id="filter-reason"
          value={filters.reason}
          onChange={(event) => onChange({ ...filters, reason: event.target.value as ReportFilters['reason'] })}
        >
          <option value="ANY">Any</option>
          {REPORT_REASONS.map((reason) => (
            <option key={reason} value={reason}>{reasonLabel(reason)}</option>
          ))}
        </Select>
      </Labelled>
    </div>
  );
}

function Labelled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
