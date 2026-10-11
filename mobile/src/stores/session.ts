// Who is signed in. Routing reads `status` (signed-out users only reach the auth screens).
// Task 3.4 adds the real flow: tokens from the API, the refresh token in expo-secure-store and the
// access token in memory only (TRD AU-02/03), restored at launch.
import { create } from 'zustand';

export type SessionStatus = 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  /** Access token, memory only (AU-02). */
  accessToken: string | null;
  signIn: (accessToken: string | null) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'signedOut',
  accessToken: null,
  signIn: (accessToken) => set({ status: 'signedIn', accessToken }),
  signOut: () => set({ status: 'signedOut', accessToken: null }),
}));
