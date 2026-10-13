// Safety (App Flow §10; BR-SF-01, 02, BR-AC-08): blocks, reports, deleting your account. What a
// block changes on screen (feed, profile, follows) lives in src/safety/block.ts.
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, call } from './client';
import type { components } from './schema';

export type BlockedUser = components['schemas']['BlockedUser'];
export type ReportDraft = components['schemas']['CreateReportDto'];
export type ReportReason = ReportDraft['reason'];
export type ReportTargetType = ReportDraft['targetType'];

export const blockedKey = ['blocks'] as const;

/** The reasons in the order the sheet lists them (App Flow §10.2). */
export const REPORT_REASONS: ReportReason[] = ['SPAM', 'NUDITY', 'HARASSMENT', 'HATE', 'VIOLENCE', 'FALSE_INFORMATION', 'OTHER'];
export const MAX_REPORT_DETAILS = 1000;

export function useBlockedAccounts() {
  return useInfiniteQuery({
    queryKey: blockedKey,
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/me/blocks', { params: { query: { cursor: pageParam, limit: 30 } }, signal })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export const blockUser = (id: string) => call(api.PUT('/api/v1/users/{id}/block', { params: { path: { id } } }));
export const unblockUser = (id: string) => call(api.DELETE('/api/v1/users/{id}/block', { params: { path: { id } } }));

/** A repeat of an open report is accepted silently (the same receipt). */
export const sendReport = (report: ReportDraft) => call(api.POST('/api/v1/reports', { body: report }));

/** Schedules the deletion (30-day grace); answers when it will happen. Wrong password → 403 INVALID_PASSWORD. */
export const deleteAccount = (password: string) => call(api.DELETE('/api/v1/me', { body: { password } }));
