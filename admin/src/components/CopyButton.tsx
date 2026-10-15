// Copying a value an admin has to hand over: an invite code, or a new admin's one-time password
// (App Flow §15.6, §15.8).
//
// The confirmation is on the button itself rather than in a toast, because the admin is looking at
// the button they just pressed, and it is announced so a screen reader hears that the copy worked.
// Where the clipboard is refused - an insecure origin, a denied permission - the button says so
// instead of silently doing nothing; the value is always printed beside it as the fallback.
import { useEffect, useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';

type State = 'idle' | 'copied' | 'failed';

export function CopyButton({ value, label = 'Copy', ...props }: ButtonProps & {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2_000);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        {...props}
        onClick={() => {
          navigator.clipboard?.writeText(value).then(
            () => setState('copied'),
            () => setState('failed'),
          );
        }}
      >
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : label}
      </Button>
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Copied to the clipboard' : state === 'failed' ? 'Could not copy — select the text instead' : ''}
      </span>
    </>
  );
}
