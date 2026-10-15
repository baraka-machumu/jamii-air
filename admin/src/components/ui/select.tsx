// A styled native `<select>`, not shadcn's Radix one. The portal's selects are short filter lists
// where the OS control is the better one: it is keyboard- and screen-reader-correct for free, it
// does not trap focus inside a table row, and it adds no dependency.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border bg-background px-2 shadow-xs transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
