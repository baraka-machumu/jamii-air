// Who is signed in. Routing reads `status`: while `restoring` (launch, App Flow §3) the splash stays
// up; signed-out users only reach the auth screens. The access token lives here, in memory only
// (TRD AU-02); the refresh token is in secure storage (src/auth/tokenStore.ts, AU-03).
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
  signIn: (accessToken: string | null, user?: SessionUser | null) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  accessToken: null,
  user: null,
  signIn: (accessToken, user = null) => set((s) => ({ status: 'signedIn', accessToken, user: user ?? s.user })),
  signOut: () => set({ status: 'signedOut', accessToken: null, user: null }),
}));
