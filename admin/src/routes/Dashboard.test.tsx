// Task 4.3: the dashboard (App Flow §15.3). What matters is that a moderator sees what needs
// attention, that the range selector scopes everything at once, and that every number behind a
// trend line is reachable without hovering.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { useSession } from '@/stores/session';
import { renderAt } from '@/test/render';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Three days of a metric, so a sparkline and a change both have something to show. */
const points = (...values: number[]) =>
  values.map((value, i) => ({ day: `2026-10-${String(13 + i).padStart(2, '0')}`, value }));

const dashboard = (overrides: Record<string, unknown> = {}) => ({
  openReports: 3,
  oldestOpenReportAt: '2026-10-11T12:00:00Z',
  suspendedUsers: 2,
  invitesRemaining: 17,
  registeredUsers: 1284,
  metrics: {
    registeredUsers: points(1200, 1240, 1284),
    dau: points(300, 320, 318),
    newSignups: points(10, 14, 12),
    posts: points(40, 44, 51),
    likes: points(400, 430, 480),
    comments: points(90, 95, 99),
    follows: points(30, 33, 36),
    retentionD1: points(44.4, 45.2, 46.1),
    retentionD7: points(30, 31, 32.5),
    retentionD30: points(20, 21, 22),
    newUserFollowPct: points(70, 72, 75),
    newUserPostPct: points(50, 52, 55),
  },
  ...overrides,
});

let urls: string[];

function server(reply: (path: string, search: URLSearchParams) => Response) {
  urls = [];
  global.fetch = vi.fn((input: Request | string) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://portal.test');
    urls.push(url.pathname + url.search);
    return Promise.resolve(reply(url.pathname, url.searchParams));
  }) as unknown as typeof fetch;
}

const dashboardOnly = (body: unknown, status = 200) => (path: string) =>
  path === '/api/v1/admin/dashboard' ? json(status, body) : json(200, {});

beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  useSession.setState({
    status: 'signedIn', accessToken: 'token-1', admin, startedAt: Date.now(), notice: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('what needs attention', () => {
  it('leads with open reports and how long the oldest has waited', async () => {
    server(dashboardOnly(dashboard()));
    renderAt(<App />, '/');

    const tile = await screen.findByRole('group', { name: 'Open reports' });
    expect(within(tile).getByText('3')).toBeInTheDocument();
    expect(within(tile).getByText(/Oldest waiting/)).toHaveTextContent('4 days');
  });

  it('says nothing is waiting instead of showing an age for a queue of zero', async () => {
    server(dashboardOnly(dashboard({ openReports: 0, oldestOpenReportAt: null })));
    renderAt(<App />, '/');

    const tile = await screen.findByRole('group', { name: 'Open reports' });
    expect(within(tile).getByText('Nothing waiting')).toBeInTheDocument();
  });

  it('offers the screens that act on it', async () => {
    server(dashboardOnly(dashboard()));
    renderAt(<App />, '/');
    await screen.findByText('Open reports'); // the data is in; the links render with it

    expect(screen.getByRole('link', { name: 'Go to reports' })).toHaveAttribute('href', '/reports');
    expect(screen.getByRole('link', { name: 'Go to users' })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: 'Go to invite codes' })).toHaveAttribute('href', '/invites');
  });
});

describe('the KPI tiles', () => {
  it('show every KPI App Flow §15.3 asks for, with the latest value', async () => {
    server(dashboardOnly(dashboard()));
    renderAt(<App />, '/');

    // By tile, not by text: each label also appears in the headline chart's metric picker, so
    // plain text would match more than one element.
    for (const label of [
      'Registered users', 'Daily active users', 'New sign-ups', 'Posts', 'Likes', 'Comments',
      'Follows', 'D1 retention', 'D7 retention', 'D30 retention',
      'New users who followed', 'New users who posted',
    ]) {
      expect(await screen.findByRole('group', { name: label })).toBeInTheDocument();
    }

    const posts = await screen.findByRole('group', { name: 'Posts' });
    expect(within(posts).getByText('51')).toBeInTheDocument();
    expect(within(posts).getByText(/\+11 vs 30 days ago/)).toBeInTheDocument();

    const retention = await screen.findByRole('group', { name: 'D1 retention' });
    expect(within(retention).getByText('46%')).toBeInTheDocument();
  });

  it('say "no data yet" for a metric the server has none for, rather than hiding the card', async () => {
    server(dashboardOnly(dashboard({ metrics: { posts: points(1, 2, 3) } })));
    renderAt(<App />, '/');

    const likes = await screen.findByRole('group', { name: 'Likes' });
    expect(within(likes).getByText('No data yet')).toBeInTheDocument();
  });

  it('name the series for a screen reader, so a trend is not colour-and-hover only', async () => {
    server(dashboardOnly(dashboard()));
    renderAt(<App />, '/');
    expect(await screen.findByRole('img', { name: /^Posts: 40 on 13 Oct to 51 on 15 Oct$/ })).toBeInTheDocument();
  });
});

describe('the range selector', () => {
  it('asks for 30 days by default and marks which range is showing', async () => {
    server(dashboardOnly(dashboard()));
    renderAt(<App />, '/');

    await waitFor(() => expect(urls.some((u) => u.includes('/admin/dashboard'))).toBe(true));
    expect(urls.find((u) => u.includes('/admin/dashboard'))).toContain('from=2026-09-16');
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('refetches the whole dashboard for another range, from one control', async () => {
    const user = userEvent.setup();
    server(dashboardOnly(dashboard()));
    renderAt(<App />, '/');
    await screen.findByText('Open reports');

    await user.click(screen.getByRole('button', { name: '7 days' }));

    await waitFor(() => expect(urls.filter((u) => u.includes('/admin/dashboard'))).toHaveLength(2));
    expect(urls.at(-1)).toContain('from=2026-10-09');
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the numbers behind the trend lines', () => {
  it('are available as a table, so a tooltip is never the only way to read one', async () => {
    const user = userEvent.setup();
    server(dashboardOnly(dashboard()));
    renderAt(<App />, '/');

    await user.click(await screen.findByRole('button', { name: 'Show daily numbers' }));

    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Posts' })).toBeInTheDocument();
    // Newest day first, and every KPI as a column.
    expect(within(table).getAllByRole('row')[1]!).toHaveTextContent('15 Oct');
    expect(within(table).getByRole('rowheader', { name: '13 Oct' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide daily numbers' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('when the dashboard cannot be loaded', () => {
  it('says why and offers to try again', async () => {
    server(dashboardOnly({ error: { code: 'ADMIN_FORBIDDEN', message: 'no' }, requestId: 'r-1' }, 403));
    renderAt(<App />, '/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Your role does not allow this action.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
