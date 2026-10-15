// The admin session (App Flow §15.2). The access token lives in memory only: the refresh token is
// an HttpOnly cookie the browser sends by itself, so nothing is kept in localStorage where a
// cross-site script could read it. A reload therefore starts with no token and refreshes once.
//
// Idle and absolute timeouts (30 min idle with a warning at 25, 12 h total) belong to task 4.2.
import { create } from 'zustand';
import type { components } from '@/api/schema';

export type AdminIdentity = components['schemas']['AdminIdentity'];

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  admin: AdminIdentity | null;
  /** Why the last sign-out happened, for the message on Login. */
  notice: 'expired' | null;
  signIn: (accessToken: string, admin: AdminIdentity) => void;
  signOut: (notice?: 'expired' | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  accessToken: null,
  admin: null,
  notice: null,
  signIn: (accessToken, admin) => set({ status: 'signedIn', accessToken, admin, notice: null }),
  signOut: (notice = null) => set({ status: 'signedOut', accessToken: null, admin: null, notice }),
}));
