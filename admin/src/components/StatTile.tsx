// A stat tile: label, value, optional change and trend line (App Flow §15.3).
//
// The value is the number the dashboard is read for, so it gets the weight and proportional
// figures. The change is text ("+14", "no change"), not a coloured arrow: on this palette the
// brand terracotta and the danger red are too close to carry meaning on their own, and "more
// posts" is good while "more open reports" is not - direction alone does not say which.
import type { ReactNode } from 'react';
import { type Point, Sparkline } from '@/components/Sparkline';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatTile({ label, value, change, changeNote, trend, format, note, className }: {
  label: string;
  value: ReactNode;
  /** A signed change, already formatted; omitted when there is nothing to compare with. */
  change?: string | null;
  /** What the change is measured against, e.g. "vs 30 days ago". */
  changeNote?: string;
  trend?: Point[];
  format?: (value: number) => string;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('p-4', className)}>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold">{value}</p>
      {change && (
        <p className="text-muted-foreground">
          {change}
          {changeNote ? ` ${changeNote}` : ''}
        </p>
      )}
      {note && <div className="mt-1">{note}</div>}
      {trend && format && (
        <div className="mt-2">
          <Sparkline points={trend} label={label} format={format} />
        </div>
      )}
    </Card>
  );
}
