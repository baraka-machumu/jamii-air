// The confirmation toast (App Flow §15.4 step 4: "Toast 'Report resolved'"). One host in the
// layout; the store it reads is src/lib/toast.ts.
import { useEffect } from 'react';
import { TOAST_MS, useToast } from '@/lib/toast';

export function ToastHost() {
  const { message, nonce, clear } = useToast();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, nonce, clear]);

  // The live region is always in the DOM: a region added at the same moment as its text is not
  // reliably announced.
  return (
    <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      {message && (
        <p className="pointer-events-auto rounded-md bg-brand-deep px-4 py-2 text-sm text-white shadow-lg">
          {message}
        </p>
      )}
    </div>
  );
}
