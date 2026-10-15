// Invite codes (Plan 4.6; App Flow §15.6). The pilot is invite-only (BRS: 10 invited adults), so
// this is how a user gets in at all: an admin creates a code, hands it over, and can revoke it
// while it is unused.
import {
  useInfiniteQuery, useMutation, useQueryClient,
  type UseInfiniteQueryResult, type UseMutationResult,
} from '@tanstack/react-query';
import { api, call } from '@/api/client';
import { adminKey } from '@/api/moderation';
import type { components } from '@/api/schema';

export type InviteItem = components['schemas']['InviteItem'];
export type InvitePage = components['schemas']['InvitePage'];
export type CreatedInvite = components['schemas']['CreatedInvite'];
export type CreateInvite = components['schemas']['CreateInviteDto'];

export const PAGE_SIZE = 25;

export const invitesKey = ['admin', 'invites'] as const;

export function useInvites(): UseInfiniteQueryResult<InviteItem[]> {
  return useInfiniteQuery({
    queryKey: invitesKey,
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/admin/invites', {
      params: { query: { limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) } },
    })),
    initialPageParam: '',
    getNextPageParam: (page: InvitePage) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

/**
 * Creating a code answers with the code itself, which is the only time the portal has it to show.
 * The whole admin namespace is invalidated because the dashboard counts invites remaining.
 */
export function useCreateInvite(): UseMutationResult<CreatedInvite, unknown, CreateInvite> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvite) => call(api.POST('/api/v1/admin/invites', { body })),
    onSuccess: () => queries.invalidateQueries({ queryKey: adminKey }),
  });
}

export function useRevokeInvite(id: string): UseMutationResult<unknown, unknown, { note: string }> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: { note: string }) => call(api.DELETE('/api/v1/admin/invites/{id}', {
      params: { path: { id } }, body,
    })),
    onSuccess: () => queries.invalidateQueries({ queryKey: adminKey }),
  });
}
