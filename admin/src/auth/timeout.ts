// Session expiry (App Flow §15.2 step 5): 30 minutes idle, with a warning at 25 and a "Stay signed
// in" button, or 12 hours in total whatever the admin does.
//
// The server enforces both limits on the refresh cookie, so this is not the authority - it is here
// so the portal says what is about to happen instead of failing the next click, which on this
// surface could be half-way through suspending an account.
import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshSession } from '@/api/client';
import { logout } from '@/auth/session';
import { useSession } from '@/stores/session';

export const IDLE_MS = 30 * 60_000;
export const WARN_AFTER_MS = 25 * 60_000;
export const ABSOLUTE_MS = 12 * 3_600_000;
/** How often the clock is checked: fine enough for a countdown, cheap enough to ignore. */
export const TICK_MS = 10_000;

/** What the admin is doing counts as activity; scrolling a long report queue included. */
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export interface TimeoutState {
  /** Seconds until the session ends, while the warning is up; null when it is not. */
  secondsLeft: number | null;
  staySignedIn: () => void;
}

/**
 * Runs only while an admin is signed in. The warning appears after 25 minutes with no input and
 * counts down; input before that silently resets the clock, so an admin at work never sees it.
 */
export function useSessionTimeout(): TimeoutState {
  const signedIn = useSession((s) => s.status === 'signedIn');
  const startedAt = useSession((s) => s.startedAt);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Set inside the effect, never during render: reading the clock while rendering is impure.
  const lastActivity = useRef<number | null>(null);
  const warning = useRef(false);

  useEffect(() => {
    if (!signedIn) return;
    lastActivity.current = Date.now();

    const onActivity = () => {
      // While the warning is up, input alone must not dismiss it: the admin has to answer it, so a
      // weighted key or a passing cat cannot hold a moderation session open.
      if (!warning.current) lastActivity.current = Date.now();
    };
    for (const event of ACTIVITY) window.addEventListener(event, onActivity, { passive: true });

    const tick = () => {
      const now = Date.now();
      const idle = now - (lastActivity.current ?? now);
      const total = startedAt ? now - startedAt : 0;
      if (idle >= IDLE_MS || total >= ABSOLUTE_MS) {
        logout('expired');
        return;
      }
      warning.current = idle >= WARN_AFTER_MS;
      setSecondsLeft(warning.current ? Math.ceil((IDLE_MS - idle) / 1000) : null);
    };
    // No first tick here: calling setState straight from an effect body cascades renders, and
    // nothing can be due within the first interval anyway (the warning is 25 minutes away).
    const timer = setInterval(tick, TICK_MS);

    return () => {
      clearInterval(timer);
      warning.current = false;
      for (const event of ACTIVITY) window.removeEventListener(event, onActivity);
    };
  }, [signedIn, startedAt]);

  const staySignedIn = useCallback(() => {
    // Rotating the cookie is what actually extends the session on the server; the local clock is
    // reset here so the warning goes at once rather than on the next tick.
    void refreshSession();
    lastActivity.current = Date.now();
    warning.current = false;
    setSecondsLeft(null);
  }, []);

  // Signed out, there is nothing to warn about, whatever the last tick left behind.
  return { secondsLeft: signedIn ? secondsLeft : null, staySignedIn };
}
