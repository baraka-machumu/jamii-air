// One post, as a moderator sees it (Plan 4.4: "post/comment view; hide / restore content").
//
// A comment has no endpoint of its own: the report that names it carries its text, and a comment
// is reached through the post it sits on. So this is the post view, and it is where a post is
// hidden or restored outside of a report - from a user's grid, or from a link in the audit log.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, call } from '@/api/client';
import type { components } from '@/api/schema';

export type AdminPost = components['schemas']['AdminPost'];

export const postKey = (id: string) => ['admin', 'post', id] as const;

export function usePost(id: string): UseQueryResult<AdminPost> {
  return useQuery({
    queryKey: postKey(id),
    queryFn: () => call(api.GET('/api/v1/admin/posts/{id}', { params: { path: { id } } })),
  });
}
