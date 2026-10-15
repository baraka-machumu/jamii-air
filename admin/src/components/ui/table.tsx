// Table primitives for the portal's lists (reports, users, invites, audit log, admins). Plain
// semantic markup: a real `<table>` is what a screen reader navigates by row and column, and the
// portal's lists are tabular data, not cards.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn('w-full border-collapse text-left', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('border-b bg-secondary/40 px-3 py-2 font-medium whitespace-nowrap', className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b px-3 py-2 align-middle', className)} {...props} />;
}
