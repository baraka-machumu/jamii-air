// Table primitives for the portal's lists (reports, users, invites, audit log, admins). Plain
// semantic markup: a real `<table>` is what a screen reader navigates by row and column, and the
// portal's lists are tabular data, not cards.
//
// The header row sticks, because these lists are read by scrolling and a column you cannot name
// is a column you misread. Rows light on hover so the eye keeps its place across wide rows.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card shadow-card">
      {/* Row hover lives here rather than on each <tr>: every list in the portal gets it, and a
          screen that renders rows in a loop does not have to remember a wrapper. */}
      <table
        className={cn(
          'w-full border-collapse text-left',
          '[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-secondary/50',
          '[&_tbody_tr:last-child_td]:border-0 [&_tbody_tr:last-child_th]:border-0',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-10 border-b bg-card/95 px-3 py-2.5 text-xs font-medium tracking-wide',
        'text-muted-foreground uppercase whitespace-nowrap backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors hover:bg-secondary/50', className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b px-3 py-2.5 align-middle', className)} {...props} />;
}
