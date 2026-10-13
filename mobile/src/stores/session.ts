// Who is signed in. Routing reads `status`: while `restoring` (launch, App Flow §3) the splash stays
// up; signed-out users only reach the auth screens; a new account goes through onboarding first
// (App Flow §4.2, first session only). The access token lives here, in memory only (TRD AU-02);
// the refresh token is in secure storage (src/auth/tokenStore.ts, AU-03).
import { create } from 'zustand';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

/** Why the user was signed out, told on Welcome: suspended mid-session (App Flow §13), or the
 * account was just scheduled for deletion (§10.4; `deletionDueAt` is an ISO date). */
export type SignOutNotice = { kind: 'suspended' } | { kind: 'deleted'; deletionDueAt: string };

export interface SessionUser {
  id: string;
  username?: string;
}

interface SessionState {
  status: SessionStatus;
  /** Access token, memory only (AU-02). Null while signed in offline, until a refresh succeeds. */
  accessToken: string | null;
  user: SessionUser | null;
  /** Just signed up: show onboarding before the tabs. Not saved: onboarding is first session only. */
  onboarding: boolean;
  /** Shown on Welcome after a sign-out the user did not ask for; cleared by the next sign-in. */
  notice: SignOutNotice | null;
  /** `onboarding`: a new account, so routing opens onboarding instead of the tabs (one update, no flash). */
  signIn: (accessToken: string | null, user?: SessionUser | null, onboarding?: boolean) => void;
  finishOnboarding: () => void;
  signOut: (notice?: SignOutNotice) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  accessToken: null,
  user: null,
  onboarding: false,
  notice: null,
  signIn: (accessToken, user = null, onboarding) => set((s) => ({
    status: 'signedIn', accessToken, user: user ?? s.user, onboarding: onboarding ?? s.onboarding, notice: null,
  })),
  finishOnboarding: () => set({ onboarding: false }),
  // A second sign-out (a refresh failing after a suspension) keeps the reason already given.
  signOut: (notice) => set((s) => ({
    status: 'signedOut', accessToken: null, user: null, onboarding: false, notice: notice ?? (s.status === 'signedOut' ? s.notice : null),
  })),
}));
