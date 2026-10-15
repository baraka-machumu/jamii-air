// The dashboard (Plan 4.3, App Flow §15.3): what needs attention first, then the KPIs.
//
// Layout follows what a moderator opens the portal for. Open reports, suspended users and invites
// remaining come first and link to the screen that acts on them; the twelve KPI tiles sit below,
// each with its trend line. The range selector is one row above everything it scopes - never a
// filter per card - so every tile shows the same slice.
import { useState } from 'react';
import { Link } from 'react-router';
import {
  KPIS, type Range, RANGES, latest, series, useDashboard,
} from '@/api/dashboard';
import { errorMessage } from '@/api/errors';
import { StatTile } from '@/components/StatTile';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ageSince, count, delta, percent, shortDay } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const [range, setRange] = useState<Range>(30);
  const [table, setTable] = useState(false);
  const dashboard = useDashboard(range);
  const data = dashboard.data;

  if (dashboard.isPending) {
    return (
      <section>
        <Header range={range} onRange={setRange} />
        <p className="mt-6 text-muted-foreground">Loading the numbers…</p>
      </section>
    );
  }

  if (dashboard.isError || !data) {
    return (
      <section>
        <Header range={range} onRange={setRange} />
        <Card className="mt-6 p-4">
          <p role="alert">{errorMessage(dashboard.error)}</p>
          <Button className="mt-3" onClick={() => void dashboard.refetch()}>Try again</Button>
        </Card>
      </section>
    );
  }

  const format = (kind: 'count' | 'percent') => (kind === 'percent' ? percent : count);
  const rangeNote = `vs ${range} days ago`;

  return (
    // A refetch holds the previous numbers at reduced opacity rather than flashing a skeleton.
    <section className={cn('transition-opacity', dashboard.isFetching && 'opacity-60')}>
      <Header range={range} onRange={setRange} />

      <h2 className="mt-6 font-semibold">Needs attention</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Open reports"
          value={count(data.openReports)}
          note={
            data.openReports > 0 ? (
              <p className="text-muted-foreground">
                {data.oldestOpenReportAt
                  ? <>Oldest waiting <span className="font-medium text-foreground">{ageSince(data.oldestOpenReportAt)}</span></>
                  : 'Oldest unknown'}
              </p>
            ) : <p className="text-muted-foreground">Nothing waiting</p>
          }
        />
        <StatTile label="Suspended users" value={count(data.suspendedUsers)} />
        <StatTile label="Invite codes remaining" value={count(data.invitesRemaining)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[['/reports', 'Go to reports'], ['/users', 'Go to users'], ['/invites', 'Go to invite codes']].map(([to, label]) => (
          <Link key={to} to={to!} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{label}</Link>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="font-semibold">Pilot KPIs</h2>
        {/* The tooltip is never the only way to read a value (Design Brief §13 accessibility). */}
        <Button variant="ghost" size="sm" onClick={() => setTable((on) => !on)} aria-expanded={table}>
          {table ? 'Hide daily numbers' : 'Show daily numbers'}
        </Button>
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {KPIS.map((kpi) => {
          const points = series(data, kpi.metric);
          const current = latest(points);
          const first = points[0]?.value;
          const show = format(kpi.kind);
          return (
            <StatTile
              key={kpi.metric}
              label={kpi.label}
              value={current === null ? <span className="text-base font-normal text-muted-foreground">No data yet</span> : show(current)}
              change={points.length > 1 && first !== undefined && current !== null ? delta(first, current, kpi.kind) : null}
              changeNote={rangeNote}
              trend={points}
              format={show}
            />
          );
        })}
      </div>

      {table && <DailyTable range={range} data={data} />}
    </section>
  );
}

function Header({ range, onRange }: { range: Range; onRange: (range: Range) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div role="group" aria-label="Date range" className="flex gap-1 rounded-md border p-0.5">
        {RANGES.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === range ? 'default' : 'ghost'}
            aria-pressed={option === range}
            onClick={() => onRange(option)}
          >
            {option} days
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Every number behind the trend lines, for a screen reader, a copy-paste or a sanity check. */
function DailyTable({ range, data }: { range: Range; data: NonNullable<ReturnType<typeof useDashboard>['data']> }) {
  const days = [...new Set(KPIS.flatMap((kpi) => series(data, kpi.metric).map((p) => p.day)))].sort().reverse();
  const value = (metric: string, day: string) => series(data, metric).find((p) => p.day === day)?.value;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left tabular-nums">
        <caption className="sr-only">Daily KPI values for the last {range} days, newest first</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="sticky left-0 bg-card py-2 pr-3 font-medium">Day</th>
            {KPIS.map((kpi) => (
              <th key={kpi.metric} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">{kpi.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day} className="border-b last:border-0">
              <th scope="row" className="sticky left-0 bg-card py-1.5 pr-3 font-normal whitespace-nowrap">{shortDay(day)}</th>
              {KPIS.map((kpi) => {
                const point = value(kpi.metric, day);
                return (
                  <td key={kpi.metric} className="px-3 py-1.5">
                    {point === undefined ? '—' : kpi.kind === 'percent' ? percent(point) : count(point)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {days.length === 0 && <p className="text-muted-foreground">No daily numbers yet.</p>}
    </div>
  );
}
