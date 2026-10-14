// The session lifecycle (App Flow §3, §4.5; TRD AU-02/03):
//  - startSession: after sign-up, log-in or a refresh: refresh token to secure storage, access
//    token to memory.
//  - refreshSession: one refresh at a time, however many requests hit a 401 together. Refresh
//    tokens rotate on every use and a reused one revokes the whole session (AU-04), so two
//    parallel refreshes would sign the user out.
//  - restoreSession: at launch. No saved token → Welcome; refresh OK → Home; 401 → Welcome;
//    no answer within 8 s → Home offline, and the refresh lands when it can.
//  - signOut: local data is always cleared; telling the server is best effort. After deleting the
//    account it carries a notice for Welcome; so does a suspension noticed mid-session (any
//    request answered 403 ACCOUNT_SUSPENDED, App Flow §13).
import { identify } from '@/analytics';
import { api, call, onSuspended, onUnauthorized } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { components } from '@/api/schema';
import { getInstallationId } from '@/notifications/installation';
import { type SignOutNotice, useSession } from '@/stores/session';
import { tokenStore } from './tokenStore';

export type SessionResponse = components['schemas']['SessionResponse'];
export type RefreshOutcome = 'refreshed' | 'signedOut' | 'offline';

/** How long the splash waits for the launch refresh before opening Home offline (App Flow §3). */
export const RESTORE_WAIT_MS = 8_000;

/** `newAccount`: just signed up, so onboarding comes before the tabs (App Flow §4.2). */
export async function startSession(session: SessionResponse, { newAccount = false } = {}): Promise<void> {
  await tokenStore.set(session.refreshToken);
  useSession.getState().signIn(session.accessToken, session.user, newAccount || undefined);
  // KPI events are keyed by the user from here on, not by the installation (TRD PA-01).
  identify(session.user?.id ?? null);
}

/** Clear this phone only: for when the server has already ended every session (account deleted). */
export async function endLocally(notice?: SignOutNotice): Promise<void> {
  await tokenStore.clear().catch(() => undefined);
  useSession.getState().signOut(notice);
  identify(null); // and anything queued is dropped: it belonged to the session that just ended
}

let inflight: Promise<RefreshOutcome> | null = null;

export function refreshSession(): Promise<RefreshOutcome> {
  inflight ??= rotate().finally(() => { inflight = null; });
  return inflight;
}

async function rotate(): Promise<RefreshOutcome> {
  const refreshToken = await tokenStore.get().catch(() => null);
  if (!refreshToken) {
    await endLocally();
    return 'signedOut';
  }
  try {
    await startSession(await call(api.POST('/api/v1/auth/refresh', { body: { refreshToken } })));
    return 'refreshed';
  } catch (error) {
    // 401 = expired, revoked or reused: the session is over. Anything else (offline, timeout,
    // 5xx, 429) leaves it as it is, to try again later.
    if (error instanceof ApiError && error.status === 401) {
      await endLocally();
      return 'signedOut';
    }
    return 'offline';
  }
}

export async function restoreSession(wait = RESTORE_WAIT_MS): Promise<void> {
  const saved = await tokenStore.get().catch(() => null);
  if (!saved) {
    useSession.getState().signOut();
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'offline'>((resolve) => { timer = setTimeout(() => resolve('offline'), wait); });
  const outcome = await Promise.race([refreshSession(), timeout]);
  clearTimeout(timer);
  // Still restoring = the refresh has not answered: open Home offline. The refresh keeps going
  // and signs in (or out) when it lands; abandoning it could lose a rotated token.
  if (outcome === 'offline' && useSession.getState().status === 'restoring') useSession.getState().signIn(null);
}

export async function signOut(notice?: SignOutNotice): Promise<void> {
  const accessToken = useSession.getState().accessToken;
  const refreshToken = await tokenStore.get().catch(() => null);
  await endLocally(notice);
  if (refreshToken && accessToken) {
    // With this installation's ID the server removes its push token too: no pushes once signed out.
    const installationId = await getInstallationId().catch(() => undefined);
    void api.POST('/api/v1/auth/logout', {
      body: { refreshToken, installationId },
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
  }
}

onUnauthorized(async () => (await refreshSession()) === 'refreshed');
// The server will not serve a suspended account: sign out here, Welcome explains.
onSuspended(() => {
  if (useSession.getState().status === 'signedIn') void endLocally({ kind: 'suspended' });
});
