// The admin session lifecycle (App Flow §15.2). Three steps, because 2FA is mandatory (TRD §8):
//
//   1. login(email, password)         → a challenge token, and either "enter your code" or
//                                       "set up your authenticator" on a first sign-in
//   2. verifyCode / enrollCode        → the session: access token in memory, refresh token in an
//                                       HttpOnly cookie the browser keeps
//   3. restore() on every page load   → one refresh with that cookie, so a reload is not a sign-in
//
// The timeouts (60 min idle, 12 h absolute) live in src/auth/timeout.ts; the server enforces the
// same limits, so the portal is only being honest about them, never the authority.
import { ADMIN_CLIENT_HEADER, api, call, refreshSession } from '@/api/client';
import type { components } from '@/api/schema';
import { useSession } from '@/stores/session';

export type LoginStep = components['schemas']['AdminLoginStep'];
export type TotpEnrollment = components['schemas']['TotpEnrollment'];

/** Step 1. Throws ApiError for wrong credentials (INVALID_CREDENTIALS) or a locked account. */
export function login(email: string, password: string): Promise<LoginStep> {
  return call(api.POST('/api/v1/admin/auth/login', { body: { email, password } }));
}

/** Step 2, later sign-ins: the 6-digit code from the authenticator. */
export async function verifyCode(challengeToken: string, code: string): Promise<void> {
  const session = await call(api.POST('/api/v1/admin/auth/totp/verify', { body: { challengeToken, code } }));
  useSession.getState().signIn(session.accessToken, session.admin);
}

/** Step 2, first sign-in: the code that confirms the authenticator was set up. */
export async function enrollCode(challengeToken: string, code: string): Promise<void> {
  const session = await call(api.POST('/api/v1/admin/auth/totp/enroll', { body: { challengeToken, code } }));
  useSession.getState().signIn(session.accessToken, session.admin);
}

/**
 * On page load: the access token is memory-only, so there is never one to start with. The cookie
 * may still hold a live session, and one refresh says so. A failure is not a notice: a visitor who
 * was never signed in should see a plain Login page.
 */
export async function restore(): Promise<void> {
  if (await refreshSession()) return;
  useSession.setState({ status: 'signedOut' });
}

/**
 * Clear the portal at once and tell the server in the background, the same way the app signs out.
 * Waiting for the server would leave a portal that looks signed in while a dead session is being
 * reported - and on an expiry that call fails anyway. The request is started first, while the
 * token is still in the store, so it goes out authenticated; the server clears the cookie.
 */
export function logout(notice: 'expired' | null = null): void {
  void call(api.POST('/api/v1/admin/auth/logout', { params: ADMIN_CLIENT_HEADER })).catch(() => undefined);
  useSession.getState().signOut(notice);
}
