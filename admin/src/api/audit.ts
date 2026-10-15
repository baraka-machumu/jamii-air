// The audit log (Plan 4.6; App Flow §15.7). Read-only, newest first, filterable by admin, action,
// target and date - the record of who did what, which is the point of requiring a note on every
// moderation action.
import { useInfiniteQuery, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { api, call } from '@/api/client';
import type { components } from '@/api/schema';

export type AuditEntry = components['schemas']['AuditEntry'];
export type AuditPage = components['schemas']['AuditPage'];

export const PAGE_SIZE = 50;

export interface AuditFilters {
  /** An admin's id; empty means everyone. Only a super-admin can list admins to choose from. */
  adminId: string;
  action: string;
  /** A user, post, comment, report or admin id, as it appears in a row. */
  targetId: string;
  /** Plain dates, inclusive, as the API takes them. */
  from: string;
  to: string;
}

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  adminId: '', action: '', targetId: '', from: '', to: '',
};

export const auditKey = (filters: AuditFilters) =>
  ['admin', 'audit', filters.adminId, filters.action, filters.targetId, filters.from, filters.to] as const;

export function useAudit(filters: AuditFilters): UseInfiniteQueryResult<AuditEntry[]> {
  return useInfiniteQuery({
    queryKey: auditKey(filters),
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/admin/audit-log', {
      params: {
        query: {
          limit: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(filters.adminId ? { adminId: filters.adminId } : {}),
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.targetId ? { targetId: filters.targetId } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
        },
      },
    })),
    initialPageParam: '',
    getNextPageParam: (page: AuditPage) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

/**
 * Where a row's target lives in the portal, so the log links to it (App Flow §15.7: "target
 * (link)"). A comment has no page of its own, so it is left as plain text; an admin target would
 * only ever link to the Admins list, which the sidebar already offers.
 */
export function targetPath(entry: AuditEntry): string | null {
  if (!entry.targetId) return null;
  switch (entry.targetType) {
    case 'USER': return `/users/${entry.targetId}`;
    case 'POST': return `/posts/${entry.targetId}`;
    case 'REPORT': return `/reports/${entry.targetId}`;
    default: return null;
  }
}
