// The report queue and one report (Plan 4.4; App Flow §15.4).
//
// The queue is paged by cursor, oldest first, and defaults to Open: a moderator opens this screen
// to clear a backlog, so the one waiting longest is the one to answer. Status and type are filters
// the server understands; reason is not a server filter, so it is applied to what has been loaded
// and the screen says so rather than pretending the queue was searched.
import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
  type UseInfiniteQueryResult, type UseMutationResult, type UseQueryResult,
} from '@tanstack/react-query';
import { api, call } from '@/api/client';
import { adminKey } from '@/api/moderation';
import type { components } from '@/api/schema';

export type ReportItem = components['schemas']['AdminReportItem'];
export type ReportPage = components['schemas']['AdminReportPage'];
export type ReportDetail = components['schemas']['AdminReportDetail'];
export type ReportStatus = components['schemas']['ReportRef']['status'];
export type TargetType = components['schemas']['AdminReportItem']['targetType'];

export const PAGE_SIZE = 25;

/** The statuses a report can be filtered by, plus "any". `OPEN` is where the queue starts. */
export const REPORT_STATUSES: ReportStatus[] = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'];
export const TARGET_TYPES: TargetType[] = ['POST', 'COMMENT', 'USER'];

/** The reasons the app offers (CreateReportDto), so the filter lists exactly what can arrive. */
export const REPORT_REASONS = [
  'SPAM', 'NUDITY', 'HARASSMENT', 'HATE', 'VIOLENCE', 'FALSE_INFORMATION', 'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam',
  NUDITY: 'Nudity',
  HARASSMENT: 'Harassment',
  HATE: 'Hate speech',
  VIOLENCE: 'Violence',
  FALSE_INFORMATION: 'False information',
  OTHER: 'Other',
};

export const reasonLabel = (reason: string) => REASON_LABELS[reason] ?? reason;

const TARGET_LABELS: Record<string, string> = { POST: 'Post', COMMENT: 'Comment', USER: 'Account' };
export const targetLabel = (type: string) => TARGET_LABELS[type] ?? type;

export interface ReportFilters {
  status: ReportStatus | 'ANY';
  type: TargetType | 'ANY';
  /** Applied in the portal: the API has no reason filter. */
  reason: ReportReason | 'ANY';
}

export const DEFAULT_FILTERS: ReportFilters = { status: 'OPEN', type: 'ANY', reason: 'ANY' };

/** Only what the server filters by belongs in the key; the reason narrows the same data. */
export const reportsKey = (filters: Pick<ReportFilters, 'status' | 'type'>) =>
  ['admin', 'reports', filters.status, filters.type] as const;

export const reportKey = (id: string) => ['admin', 'report', id] as const;

export function useReports(filters: ReportFilters): UseInfiniteQueryResult<ReportItem[]> {
  return useInfiniteQuery({
    queryKey: reportsKey(filters),
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/admin/reports', {
      params: {
        query: {
          limit: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(filters.status === 'ANY' ? {} : { status: filters.status }),
          ...(filters.type === 'ANY' ? {} : { type: filters.type }),
        },
      },
    })),
    initialPageParam: '',
    getNextPageParam: (page: ReportPage) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    // A queue two moderators share goes stale fast.
    staleTime: 15_000,
  });
}

export function useReport(id: string): UseQueryResult<ReportDetail> {
  return useQuery({
    queryKey: reportKey(id),
    queryFn: () => call(api.GET('/api/v1/admin/reports/{id}', { params: { path: { id } } })),
  });
}

export type ReportDecision = components['schemas']['UpdateReportDto'];

/**
 * Move a report along: to REVIEWING when it is opened, or closed as RESOLVED / DISMISSED with a
 * note. Closing invalidates the whole admin namespace (the queue, the dashboard tiles and the
 * audit log all change); REVIEWING only touches this report, so it leaves the queue alone - a
 * moderator reading a report should not have the list shift under them.
 */
export function useUpdateReport(id: string): UseMutationResult<unknown, unknown, ReportDecision> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: ReportDecision) => call(api.PATCH('/api/v1/admin/reports/{id}', {
      params: { path: { id } }, body,
    })),
    onSuccess: (_data, body) => {
      if (body.status === 'REVIEWING') return queries.invalidateQueries({ queryKey: reportKey(id) });
      return queries.invalidateQueries({ queryKey: adminKey });
    },
  });
}

/** The target's own id, for the moderation actions and the links to it. */
export function targetId(report: ReportDetail): string | null {
  const target = report.target as { postId?: string; commentId?: string; userId?: string } | null;
  if (report.targetType === 'POST') return target?.postId ?? null;
  if (report.targetType === 'COMMENT') return target?.commentId ?? null;
  return target?.userId ?? report.reportedUserId;
}
