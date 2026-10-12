// Who is signed in. Routing reads `status`: while `restoring` (launch, App Flow §3) the splash stays
// up; signed-out users only reach the auth screens; a new account goes through onboarding first
// (App Flow §4.2, first session only). The access token lives here, in memory only (TRD AU-02);
// the refresh token is in secure storage (src/auth/tokenStore.ts, AU-03).
import { create } from 'zustand';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

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
  /** `onboarding`: a new account, so routing opens onboarding instead of the tabs (one update, no flash). */
  signIn: (accessToken: string | null, user?: SessionUser | null, onboarding?: boolean) => void;
  finishOnboarding: () => void;
  signOut: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  accessToken: null,
  user: null,
  onboarding: false,
  signIn: (accessToken, user = null, onboarding) => set((s) => ({
    status: 'signedIn', accessToken, user: user ?? s.user, onboarding: onboarding ?? s.onboarding,
  })),
  finishOnboarding: () => set({ onboarding: false }),
  signOut: () => set({ status: 'signedOut', accessToken: null, user: null, onboarding: false }),
}));
