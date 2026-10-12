// The signed-in user's own account (GET / PATCH /me, App Flow §8.3–8.4, §11). One cache entry,
// updated in place by every edit, so the profile tab, Edit profile and Settings agree.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from './client';
import type { components } from './schema';

export type Me = components['schemas']['Me'];
export type MeChanges = components['schemas']['UpdateMeDto'];

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: () => call(api.GET('/api/v1/me')) });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: MeChanges) => call(api.PATCH('/api/v1/me', { body: changes })),
    onSuccess: (me) => queryClient.setQueryData(meKey, me),
  });
}

export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 160;

/** Edit profile's text fields (App Flow §8.4). */
export interface ProfileForm { displayName: string; username: string; bio: string }

export const profileFormOf = (me: Me): ProfileForm =>
  ({ displayName: me.displayName ?? '', username: me.username, bio: me.bio ?? '' });

/** Only the fields that changed; an emptied name or bio is sent as null (removes it). */
export function changesOf(me: Me, form: ProfileForm): MeChanges {
  const changes: MeChanges = {};
  const name = form.displayName.trim();
  const bio = form.bio.trim();
  if (name !== (me.displayName ?? '')) changes.displayName = name || null;
  if (form.username !== me.username) changes.username = form.username;
  if (bio !== (me.bio ?? '')) changes.bio = bio || null;
  return changes;
}
