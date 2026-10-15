// The trend line in a stat tile (App Flow §15.3 "simple trend lines").
//
// One series, so one hue - the validated chart-1 slot, not the UI primary (src/index.css) - with
// the latest point marked, and no axes, grid or per-point labels: the tile's own value is the
// endpoint, and every number is
// also in the dashboard's table view, so the tooltip only ever enhances.
//
// Hover and keyboard focus show the same thing. The pointer is matched to the nearest point across
// the whole plot rather than to the 3px dot, so there is nothing to aim at.
import { useId, useRef, useState } from 'react';
import { shortDay } from '@/lib/format';

export interface Point {
  day: string;
  value: number;
}

const WIDTH = 160;
const HEIGHT = 36;
const PAD = 3; // room for the end marker's 2px surface ring

export function Sparkline({ points, label, format }: {
  points: Point[];
  /** Names the series for a screen reader; the tile's visible label is the same text. */
  label: string;
  format: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const plot = useRef<SVGSVGElement>(null);
  const tooltipId = useId();

  // One point cannot be a line, and a flat series still deserves its value - the tile shows it.
  if (points.length < 2) return <div className="h-9" aria-hidden="true" />;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series sits in the middle of the band instead of dividing by zero.
  const span = max - min || 1;
  const x = (index: number) => PAD + (index / (points.length - 1)) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const shown = active ?? last;
  const point = points[shown]!;

  const nearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = (event.clientX - box.left) / box.width;
    const index = Math.round(ratio * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  };

  return (
    <div className="relative">
      <svg
        ref={plot}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-9 w-full touch-none"
        role="img"
        aria-label={`${label}: ${format(points[0]!.value)} on ${shortDay(points[0]!.day)} to ${format(points[last]!.value)} on ${shortDay(points[last]!.day)}`}
        aria-describedby={active === null ? undefined : tooltipId}
        tabIndex={0}
        onPointerMove={nearest}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
      >
        {/* 2px line, no fill: an area under a 36px sparkline reads as a block, not a trend. */}
        <path d={path} fill="none" stroke="var(--color-chart-1)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* The point being read, in the accent, with a surface ring so it clears the line. */}
        <circle cx={x(shown)} cy={y(point.value)} r="3"
          fill="var(--color-chart-1)" stroke="var(--color-card)" strokeWidth="2" />
      </svg>
      {active !== null && (
        <p id={tooltipId} role="status"
          className="pointer-events-none absolute -top-1 right-0 rounded border bg-card px-1.5 py-0.5 text-xs shadow-sm">
          <span className="font-medium">{format(point.value)}</span>{' '}
          <span className="text-muted-foreground">{shortDay(point.day)}</span>
        </p>
      )}
    </div>
  );
}
