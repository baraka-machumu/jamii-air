// The dashboard's data (Plan 4.3; App Flow §15.3). One request per range: the KPI series come
// pre-computed from `daily_metrics` (TRD PA-02), so the portal only formats them.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, call } from '@/api/client';
import type { components } from '@/api/schema';

export type Dashboard = components['schemas']['AdminDashboard'];
export type MetricPoint = components['schemas']['MetricPoint'];

/** The ranges the portal offers (App Flow §15.3). */
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

/** An ISO date `days` before today, in the browser's own day - the API takes plain dates. */
export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const day = new Date(from);
  day.setDate(day.getDate() - days);
  return day.toISOString().slice(0, 10);
}

export const dashboardKey = (range: Range) => ['admin', 'dashboard', range] as const;

export function useDashboard(range: Range): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: dashboardKey(range),
    // `to` is left out so the server decides what "today" is; only the start is asked for.
    queryFn: () => call(api.GET('/api/v1/admin/dashboard', {
      params: { query: { from: isoDaysAgo(range - 1) } },
    })),
    // Moderation numbers move while an admin works, but not by the second.
    staleTime: 60_000,
    // Holding the previous range on screen while the next one loads avoids a skeleton flash.
    placeholderData: (previous) => previous,
  });
}

export type MetricKind = 'count' | 'percent';

export interface Kpi {
  /** The key inside `metrics`, as the API spells it. */
  metric: string;
  label: string;
  kind: MetricKind;
}

/**
 * The KPI cards, in the order App Flow §15.3 lists them: who is here, what they did today, then
 * whether they came back and whether they got started.
 */
export const KPIS: Kpi[] = [
  { metric: 'registeredUsers', label: 'Registered users', kind: 'count' },
  { metric: 'dau', label: 'Daily active users', kind: 'count' },
  { metric: 'newSignups', label: 'New sign-ups', kind: 'count' },
  { metric: 'posts', label: 'Posts', kind: 'count' },
  { metric: 'likes', label: 'Likes', kind: 'count' },
  { metric: 'comments', label: 'Comments', kind: 'count' },
  { metric: 'follows', label: 'Follows', kind: 'count' },
  { metric: 'retentionD1', label: 'D1 retention', kind: 'percent' },
  { metric: 'retentionD7', label: 'D7 retention', kind: 'percent' },
  { metric: 'retentionD30', label: 'D30 retention', kind: 'percent' },
  { metric: 'newUserFollowPct', label: 'New users who followed', kind: 'percent' },
  { metric: 'newUserPostPct', label: 'New users who posted', kind: 'percent' },
];

/**
 * A metric's series, oldest first. A metric the server did not send is an empty series rather than
 * a missing card: the dashboard says "no data yet", which is what a quiet pilot day looks like.
 */
export function series(data: Dashboard | undefined, metric: string): MetricPoint[] {
  const points = data?.metrics?.[metric] ?? [];
  return [...points].sort((a, b) => a.day.localeCompare(b.day));
}

/** The latest value, which is what a KPI card leads with. */
export function latest(points: MetricPoint[]): number | null {
  return points.length ? points[points.length - 1]!.value : null;
}
