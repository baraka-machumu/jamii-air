// The admin session (App Flow §15.2). The access token lives in memory only: the refresh token is
// an HttpOnly cookie the browser sends by itself, so nothing is kept in localStorage where a
// cross-site script could read it. A reload therefore starts with no token and refreshes once.
//
// The idle and absolute timeouts (60 min idle with a warning at 55, 12 h total) are enforced in
// src/auth/timeout.ts, which needs to know when this session started.
import { create } from 'zustand';
import type { components } from '@/api/schema';

export type AdminIdentity = components['schemas']['AdminIdentity'];

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  admin: AdminIdentity | null;
  /** When this sign-in happened, for the 12 h absolute limit. */
  startedAt: number | null;
  /** Why the last sign-out happened, for the message on Login. */
  notice: 'expired' | null;
  signIn: (accessToken: string, admin: AdminIdentity) => void;
  signOut: (notice?: 'expired' | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  accessToken: null,
  admin: null,
  startedAt: null,
  notice: null,
  // A refresh keeps the session that is already running: startedAt moves only on a real sign-in,
  // or the 12 h limit would never be reached.
  signIn: (accessToken, admin) => set((s) => ({
    status: 'signedIn',
    accessToken,
    admin,
    startedAt: s.startedAt ?? Date.now(),
    notice: null,
  })),
  signOut: (notice = null) => set({ status: 'signedOut', accessToken: null, admin: null, startedAt: null, notice }),
}));
