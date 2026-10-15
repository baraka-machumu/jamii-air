// Admin accounts (Plan 4.6; App Flow §15.8). Super-admin only, and the API enforces that: the
// portal hides the page from a moderator because a dead link is worse than no link, not because
// hiding it is the protection.
import {
  useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult,
} from '@tanstack/react-query';
import { api, call } from '@/api/client';
import { adminKey } from '@/api/moderation';
import type { components } from '@/api/schema';

export type AdminAccount = components['schemas']['AdminAccount'];
export type CreateAdmin = components['schemas']['CreateAdminDto'];
export type CreatedAdmin = components['schemas']['CreatedAdmin'];
export type UpdateAdmin = components['schemas']['UpdateAdminDto'];
export type AdminRole = AdminAccount['role'];

export const adminsKey = ['admin', 'admins'] as const;

/**
 * `enabled` is how a screen says it may ask at all: the audit log offers an admin filter only to a
 * super-admin, and a moderator must not have the request made on their behalf just to have it
 * refused.
 */
export function useAdmins(enabled = true): UseQueryResult<AdminAccount[]> {
  return useQuery({
    queryKey: adminsKey,
    queryFn: () => call(api.GET('/api/v1/admin/admins')),
    select: (page: components['schemas']['AdminAccountList']) => page.items,
    enabled,
  });
}

/**
 * Adding an admin answers with a one-time temporary password (App Flow §15.8). It is never shown
 * again and never stored, so the screen holds it until the dialog is closed.
 */
export function useCreateAdmin(): UseMutationResult<CreatedAdmin, unknown, CreateAdmin> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAdmin) => call(api.POST('/api/v1/admin/admins', { body })),
    onSuccess: () => queries.invalidateQueries({ queryKey: adminKey }),
  });
}

/** Change role, disable, or re-enable (which also unlocks a locked account). */
export function useUpdateAdmin(id: string): UseMutationResult<unknown, unknown, UpdateAdmin> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAdmin) => call(api.PATCH('/api/v1/admin/admins/{id}', {
      params: { path: { id } }, body,
    })),
    onSuccess: () => queries.invalidateQueries({ queryKey: adminKey }),
  });
}

/** Force the admin to enrol an authenticator again at their next sign-in. */
export function useResetTotp(id: string): UseMutationResult<unknown, unknown, { note: string }> {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (body: { note: string }) => call(api.POST('/api/v1/admin/admins/{id}/reset-2fa', {
      params: { path: { id } }, body,
    })),
    onSuccess: () => queries.invalidateQueries({ queryKey: adminKey }),
  });
}

export const roleLabel = (role: string) => (role === 'SUPER_ADMIN' ? 'Super-admin' : 'Moderator');
