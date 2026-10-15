// A status, as words with a tint behind them. The words come from src/lib/status.ts; the border
// gives the badge an edge that survives a greyscale print.
import { statusLabel, statusTone, type Tone } from '@/lib/status';
import { cn } from '@/lib/utils';

const TONES: Record<Tone, string> = {
  neutral: 'border-border bg-secondary text-secondary-foreground',
  attention: 'border-warning/40 bg-warning/10 text-warning',
  done: 'border-success/40 bg-success/10 text-success',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[statusTone(status)],
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
