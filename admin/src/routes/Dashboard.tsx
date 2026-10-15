// The dashboard (Plan 4.3, App Flow §15.3): what needs attention first, then the KPIs.
//
// Layout follows what a moderator opens the portal for. Open reports, suspended users and invites
// remaining come first and link to the screen that acts on them; a headline chart gives one KPI
// enough room to actually read a trend off; the twelve tiles sit below, each with its sparkline.
// The range selector is one row above everything it scopes - never a filter per card - so every
// tile, the chart and the table all show the same slice.
import { Suspense, lazy, useState } from 'react';
import { AlertTriangle, ArrowRight, KeyRound, UserX } from 'lucide-react';
import { Link } from 'react-router';
import {
  KPIS, type Range, RANGES, latest, series, useDashboard,
} from '@/api/dashboard';
import { errorMessage } from '@/api/errors';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ageSince, count, delta, percent, shortDay } from '@/lib/format';
import { cn } from '@/lib/utils';

// recharts is ~500 kB of the bundle, and the twelve tiles draw their own sparklines without it.
// Splitting it out keeps the portal's first load small on a slow connection; the card reserves
// the chart's height so nothing jumps when it arrives.
const TrendChart = lazy(() => import('@/components/TrendChart').then((m) => ({ default: m.TrendChart })));

const CHART_HEIGHT = 240;

const format = (kind: 'count' | 'percent') => (kind === 'percent' ? percent : count);

export default function Dashboard() {
  const [range, setRange] = useState<Range>(30);
  const [table, setTable] = useState(false);
  const [headline, setHeadline] = useState(KPIS[1]!.metric); // Daily active users
  const dashboard = useDashboard(range);
  const data = dashboard.data;

  if (dashboard.isPending) {
    return (
      <section className="space-y-6">
        <Header range={range} onRange={setRange} />
        <p className="text-muted-foreground">Loading the numbers…</p>
      </section>
    );
  }

  if (dashboard.isError || !data) {
    return (
      <section className="space-y-6">
        <Header range={range} onRange={setRange} />
        <Card className="p-5">
          <p role="alert">{errorMessage(dashboard.error)}</p>
          <Button className="mt-3" onClick={() => void dashboard.refetch()}>Try again</Button>
        </Card>
      </section>
    );
  }

  const rangeNote = `vs ${range} days ago`;
  const kpi = KPIS.find((k) => k.metric === headline) ?? KPIS[0]!;
  const headlinePoints = series(data, kpi.metric);

  return (
    // A refetch holds the previous numbers at reduced opacity rather than flashing a skeleton.
    <section className={cn('space-y-6 transition-opacity', dashboard.isFetching && 'opacity-60')}>
      <Header range={range} onRange={setRange} />

      <div className="space-y-2">
        <SectionHeader title="Needs attention" description="Everything here links to the screen that acts on it." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Open reports"
            value={count(data.openReports)}
            icon={<AlertTriangle />}
            tone={data.openReports > 0 ? 'critical' : 'default'}
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
          <StatTile label="Suspended users" value={count(data.suspendedUsers)} icon={<UserX />} />
          <StatTile
            label="Invite codes remaining"
            value={count(data.invitesRemaining)}
            icon={<KeyRound />}
            tone={data.invitesRemaining === 0 ? 'warning' : 'default'}
            note={data.invitesRemaining === 0 ? <p className="text-muted-foreground">No one new can join</p> : undefined}
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {([['/reports', 'Go to reports'], ['/users', 'Go to users'], ['/invites', 'Go to invite codes']] as const).map(([to, label]) => (
            <Link key={to} to={to} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {label}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{kpi.label}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last {range} days
              {latest(headlinePoints) !== null && <> · now <span className="font-medium text-foreground">{format(kpi.kind)(latest(headlinePoints)!)}</span></>}
            </p>
          </div>
          {/* A picker, not twelve charts: one metric at a time keeps one y axis and one meaning. */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Show</span>
            <select
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
              aria-label="Metric to chart"
              className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
            >
              {KPIS.map((option) => (
                <option key={option.metric} value={option.metric}>{option.label}</option>
              ))}
            </select>
          </label>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div style={{ height: CHART_HEIGHT }} aria-hidden />}>
            <TrendChart points={headlinePoints} label={kpi.label} format={format(kpi.kind)} height={CHART_HEIGHT} />
          </Suspense>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <SectionHeader
          title="Pilot KPIs"
          description="The twelve numbers Release 1 is judged on."
          actions={
            // The tooltip is never the only way to read a value (Design Brief §13 accessibility).
            <Button variant="outline" size="sm" onClick={() => setTable((on) => !on)} aria-expanded={table}>
              {table ? 'Hide daily numbers' : 'Show daily numbers'}
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {KPIS.map((item) => {
            const points = series(data, item.metric);
            const current = latest(points);
            const first = points[0]?.value;
            const show = format(item.kind);
            return (
              <StatTile
                key={item.metric}
                label={item.label}
                value={current === null ? <span className="text-base font-normal text-muted-foreground">No data yet</span> : show(current)}
                change={points.length > 1 && first !== undefined && current !== null ? delta(first, current, item.kind) : null}
                changeNote={rangeNote}
                trend={points}
                format={show}
              />
            );
          })}
        </div>
      </div>

      {table && <DailyTable range={range} data={data} />}
    </section>
  );
}

function Header({ range, onRange }: { range: Range; onRange: (range: Range) => void }) {
  return (
    <PageHeader
      title="Dashboard"
      description="How the pilot is going, and what is waiting for a moderator."
      actions={
        <div role="group" aria-label="Date range" className="flex gap-0.5 rounded-lg border bg-card p-0.5 shadow-card">
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
      }
    />
  );
}

/** Every number behind the trend lines, for a screen reader, a copy-paste or a sanity check. */
function DailyTable({ range, data }: { range: Range; data: NonNullable<ReturnType<typeof useDashboard>['data']> }) {
  const days = [...new Set(KPIS.flatMap((kpi) => series(data, kpi.metric).map((p) => p.day)))].sort().reverse();
  const value = (metric: string, day: string) => series(data, metric).find((p) => p.day === day)?.value;

  if (days.length === 0) return <p className="text-muted-foreground">No daily numbers yet.</p>;

  return (
    <Table>
      <caption className="sr-only">Daily KPI values for the last {range} days, newest first</caption>
      <thead>
        <tr>
          <Th className="sticky left-0 z-20">Day</Th>
          {KPIS.map((kpi) => <Th key={kpi.metric}>{kpi.label}</Th>)}
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <Tr key={day}>
            <th scope="row" className="sticky left-0 border-b bg-card px-3 py-2.5 font-normal whitespace-nowrap">
              {shortDay(day)}
            </th>
            {KPIS.map((kpi) => {
              const point = value(kpi.metric, day);
              return (
                <Td key={kpi.metric}>
                  {point === undefined ? '—' : kpi.kind === 'percent' ? percent(point) : count(point)}
                </Td>
              );
            })}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
