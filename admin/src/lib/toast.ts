// The store behind the confirmation toast (App Flow §15.4 step 4). A tiny store rather than
// context, so a mutation handler deep inside a dialog can confirm without the screen threading a
// callback down to it.
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** Bumped on every show, so the same message twice still re-announces and restarts the timer. */
  nonce: number;
  show: (message: string) => void;
  clear: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  nonce: 0,
  show: (message) => set((s) => ({ message, nonce: s.nonce + 1 })),
  clear: () => set({ message: null }),
}));

/** Confirmations only. A failure gets an inline banner on the screen that caused it. */
export const showToast = (message: string) => useToast.getState().show(message);

export const TOAST_MS = 4_000;
