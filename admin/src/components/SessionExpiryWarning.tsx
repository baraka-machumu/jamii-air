// The 25-minute warning (App Flow §15.2 step 5). A bar rather than a modal dialog: a moderator may
// be mid-sentence in a reason note, and a modal would steal the focus out of it.
import { Button } from '@/components/ui/button';
import { useSessionTimeout } from '@/auth/timeout';

export function SessionExpiryWarning() {
  const { secondsLeft, staySignedIn } = useSessionTimeout();
  if (secondsLeft === null) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const left = minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : `${secondsLeft} seconds`;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center justify-between gap-4 border-b border-warning/40 bg-warning/10 px-6 py-2"
    >
      <p>Your session ends in {left} unless you continue.</p>
      <Button size="sm" variant="outline" onClick={staySignedIn}>Stay signed in</Button>
    </div>
  );
}
