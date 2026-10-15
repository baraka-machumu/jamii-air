// The dashboard's headline chart: one metric over the chosen range, big enough to earn axes.
//
// The twelve tiles keep their own 36px Sparkline - at that size axes and a grid are noise. This is
// the opposite case: the chart a moderator actually reads a trend off, so it gets a recessive
// grid, dated ticks, a crosshair and a tooltip.
//
// Rules this follows (and why, so a later edit does not undo them):
//   - one series, so no legend: the card title names it, and the last value is labelled directly;
//   - one y axis, always - a second measure means a second chart, never a second scale;
//   - the series colour is the validated chart-1 slot, and the fill is that hue at low alpha
//     rather than a second hue, so the area never reads as another series;
//   - the grid and axes are muted, because the data is the subject;
//   - every number here is also in Show daily numbers, so the tooltip only ever enhances.
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Point } from '@/components/Sparkline';
import { shortDay } from '@/lib/format';

export function TrendChart({ points, label, format, height = 240 }: {
  points: Point[];
  label: string;
  format: (value: number) => string;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div className="grid text-muted-foreground" style={{ height }}>
        <p className="self-center text-center">Not enough days yet to draw a trend.</p>
      </div>
    );
  }

  return (
    <div style={{ height }}>
      {/* The chart is decorative to a screen reader; the figure below names the whole series and
          the daily table carries every value. */}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
            stroke="var(--color-chart-grid)"
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={format}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
            stroke="var(--color-chart-grid)"
            width={48}
            tickMargin={4}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const point = active ? payload?.[0]?.payload as Point | undefined : undefined;
              if (!point) return null;
              return (
                <div className="rounded-md border bg-popover px-2 py-1.5 text-xs shadow-raised">
                  <p className="text-muted-foreground">{shortDay(point.day)}</p>
                  <p className="font-medium">{label}: {format(point.value)}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            fill="url(#trend-fill)"
            // A dot per day turns a 90-day series into a bead necklace; the active one is enough.
            dot={false}
            activeDot={{ r: 4, fill: 'var(--color-chart-1)', stroke: 'var(--color-card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
