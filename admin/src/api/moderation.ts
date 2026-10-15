// The actions a moderator takes (App Flow §15.4 steps 3a-3c, §15.5). They are collected here
// rather than beside each screen because the same four actions are reached from two places: a
// report's detail page and the user's or post's own page.
//
// Every one of them takes a reason note - the server requires it (`fn__require_note`) and the note
// is what the audit log shows later - and hiding or suspending from a report can close that report
// in the same call (`reportId`), which is what App Flow §15.4 step 3a means by "report can be
// marked Resolved in the same dialog".
//
// After any of them the whole `['admin']` query namespace is invalidated rather than the one list
// that was on screen: a single suspension changes the user's status, the report queue, the
// dashboard's attention tiles, the user's post grid and the audit log at once, and enumerating
// those is a list that silently rots as screens are added.
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { api, call } from '@/api/client';

export interface NoteInput {
  note: string;
  /** Set when the action is taken from a report, to close it in the same call. */
  reportId?: string;
}

/** What each action does on the server, by the name the screens use. */
const ACTIONS = {
  hidePost: (id: string, body: NoteInput) =>
    call(api.POST('/api/v1/admin/posts/{id}/hide', { params: { path: { id } }, body })),
  unhidePost: (id: string, body: NoteInput) =>
    call(api.POST('/api/v1/admin/posts/{id}/unhide', { params: { path: { id } }, body })),
  hideComment: (id: string, body: NoteInput) =>
    call(api.POST('/api/v1/admin/comments/{id}/hide', { params: { path: { id } }, body })),
  unhideComment: (id: string, body: NoteInput) =>
    call(api.POST('/api/v1/admin/comments/{id}/unhide', { params: { path: { id } }, body })),
  suspendUser: (id: string, body: NoteInput) =>
    call(api.POST('/api/v1/admin/users/{id}/suspend', { params: { path: { id } }, body })),
  reinstateUser: (id: string, body: NoteInput) =>
    call(api.POST('/api/v1/admin/users/{id}/reinstate', { params: { path: { id } }, body })),
  // Revoking sessions is not about a report, so the server's body is the note alone.
  revokeSessions: (id: string, body: NoteInput) =>
    call(api.POST('/api/v1/admin/users/{id}/revoke-sessions', { params: { path: { id } }, body: { note: body.note } })),
} as const;

export type ModerationActionName = keyof typeof ACTIONS;

/** Everything a moderation action touches, in one key prefix. */
export const adminKey = ['admin'] as const;

export function useModerationAction(
  action: ModerationActionName,
  targetId: string,
): UseMutationResult<unknown, unknown, NoteInput> {
  const queries = useQueryClient();
  return useMutation({
    // The actions return different shapes and no caller reads them (the invalidation below is
    // what updates the screen), so the result is widened rather than made into a union.
    mutationFn: (input: NoteInput): Promise<unknown> => ACTIONS[action](targetId, input),
    onSuccess: () => queries.invalidateQueries({ queryKey: adminKey }),
  });
}
