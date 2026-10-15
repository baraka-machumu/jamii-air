// A stat tile: label, value, optional change and trend line (App Flow §15.3).
//
// The value is the number the dashboard is read for, so it gets the weight and proportional
// figures. The change is text ("+14", "no change"), not a coloured arrow: on this palette the
// brand terracotta and the danger red are too close to carry meaning on their own, and "more
// posts" is good while "more open reports" is not - direction alone does not say which.
//
// `tone` is for the attention tiles only, where the number *is* a state (reports waiting). It
// shows as a left edge and a tinted value, always next to the words that say what it means.
import type { ReactNode } from 'react';
import { type Point, Sparkline } from '@/components/Sparkline';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'warning' | 'critical';

const EDGE: Record<StatTone, string> = {
  default: 'before:bg-transparent',
  warning: 'before:bg-warning',
  critical: 'before:bg-destructive',
};

const VALUE: Record<StatTone, string> = {
  default: '',
  warning: 'text-warning',
  critical: 'text-destructive',
};

export function StatTile({ label, value, change, changeNote, trend, format, note, icon, tone = 'default', className }: {
  label: string;
  value: ReactNode;
  /** A signed change, already formatted; omitted when there is nothing to compare with. */
  change?: string | null;
  /** What the change is measured against, e.g. "vs 30 days ago". */
  changeNote?: string;
  trend?: Point[];
  format?: (value: number) => string;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    // A named group: the value, the change, the note and the trend only mean anything together,
    // so a screen reader announces them as one thing called by its label - and a test can ask for
    // "the Open reports tile" instead of guessing at the markup around it.
    <Card
      role="group"
      aria-label={label}
      className={cn(
        'relative overflow-hidden p-4 transition-shadow hover:shadow-raised',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
        EDGE[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground">{label}</p>
        {icon && <span aria-hidden className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', VALUE[tone])}>{value}</p>
      {change && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {change}
          {changeNote ? ` ${changeNote}` : ''}
        </p>
      )}
      {note && <div className="mt-1 text-xs">{note}</div>}
      {trend && format && (
        <div className="mt-3">
          <Sparkline points={trend} label={label} format={format} />
        </div>
      )}
    </Card>
  );
}
