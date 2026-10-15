// Task 4.5: the users list and one account (App Flow §15.5). What matters is that the search does
// not fire per keystroke, that a moderator sees the state of an account before acting on it
// (including the posts a plain grid would hide), and that both actions record a reason.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { useSession } from '@/stores/session';
import { renderAt } from '@/test/render';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const userItem = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u1',
  username: 'juma',
  displayName: 'Juma M',
  email: 'juma@example.test',
  status: 'ACTIVE',
  avatarUrl: null,
  postCount: 12,
  followerCount: 34,
  openReports: 2,
  lastActiveAt: '2026-10-14T09:00:00Z',
  createdAt: '2026-09-01T09:00:00Z',
  ...overrides,
});

const userDetail = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u1',
  username: 'juma',
  displayName: 'Juma M',
  bio: 'Dar es Salaam',
  email: 'juma@example.test',
  status: 'ACTIVE',
  avatarUrl: null,
  locale: 'sw',
  postCount: 12,
  followerCount: 34,
  followingCount: 20,
  inviteCode: 'JAMII-7',
  suspendedAt: null,
  deletionRequestedAt: null,
  lastActiveAt: '2026-10-14T09:00:00Z',
  createdAt: '2026-09-01T09:00:00Z',
  reportsFiled: 1,
  activeSessions: 2,
  recentPosts: [],
  reportsAgainst: [],
  moderationHistory: [],
  ...overrides,
});

interface Sent { method: string; path: string; body: unknown }
let sent: Sent[];

function server(reply: (path: string, method: string) => Response) {
  sent = [];
  global.fetch = vi.fn(async (input: Request | string) => {
    const request = typeof input === 'string' ? new Request(input) : input;
    const url = new URL(request.url, 'http://portal.test');
    // Every page load refreshes from the cookie (`restore()`), so the stub answers it with the
    // session already in the store - otherwise the admin is signed out mid-test and screens that
    // depend on the role see nobody.
    if (url.pathname === '/api/v1/admin/auth/refresh') {
      const current = useSession.getState().admin;
      return json(200, { accessToken: 'token-1', expiresIn: 900, admin: current });
    }
    const raw = request.method === 'GET' ? null : await request.text();
    sent.push({ method: request.method, path: url.pathname + url.search, body: raw ? (JSON.parse(raw) as unknown) : null });
    return reply(url.pathname, request.method);
  }) as unknown as typeof fetch;
}

const listAnd = (items: unknown[], detail: unknown = userDetail()) =>
  (path: string, method: string): Response => {
    if (path === '/api/v1/admin/users') return json(200, { items, nextCursor: null });
    if (path === '/api/v1/admin/users/u1') return json(200, detail);
    if (method !== 'GET') return json(200, {});
    return json(200, { items: [], nextCursor: null });
  };

const searches = () => sent.filter((call) => call.path.startsWith('/api/v1/admin/users?'));

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

describe('the list', () => {
  it('shows each account with the count that decides whether it needs attention', async () => {
    server(listAnd([userItem()]));
    renderAt(<App />, '/users');

    expect(await screen.findByText('@juma')).toBeInTheDocument();
    const row = screen.getByRole('table').querySelector('tbody tr')!;
    expect(within(row as HTMLElement).getByText('2')).toBeInTheDocument();
  });

  it('waits for the typing to stop before searching', async () => {
    const user = userEvent.setup();
    server(listAnd([userItem()]));
    renderAt(<App />, '/users');
    await screen.findByText('@juma');
    const before = searches().length;

    await user.type(screen.getByLabelText('Search'), 'jum');

    // Three keystrokes must not be three searches.
    expect(searches().length).toBe(before);
    await waitFor(() => {
      expect(searches().some((call) => call.path.includes('q=jum'))).toBe(true);
    });
    expect(searches().filter((call) => call.path.includes('q=')).length).toBe(1);
  });

  it('filters by status through the API', async () => {
    const user = userEvent.setup();
    server(listAnd([userItem()]));
    renderAt(<App />, '/users');
    await screen.findByText('@juma');

    await user.selectOptions(screen.getByLabelText('Status'), 'SUSPENDED');

    await waitFor(() => {
      expect(searches().some((call) => call.path.includes('status=SUSPENDED'))).toBe(true);
    });
  });

  it('says when a search matched nothing', async () => {
    const user = userEvent.setup();
    server(listAnd([]));
    renderAt(<App />, '/users');

    await user.type(screen.getByLabelText('Search'), 'nobody');

    expect(await screen.findByText(/No account matches “nobody”/)).toBeInTheDocument();
  });
});

describe('one account', () => {
  it('shows the account, its numbers and how many devices it is signed in on', async () => {
    server(listAnd([], userDetail()));
    renderAt(<App />, '/users/u1');

    expect(await screen.findByRole('heading', { name: 'Juma M' })).toBeInTheDocument();
    expect(screen.getByText('juma@example.test')).toBeInTheDocument();
    expect(screen.getByText('Swahili')).toBeInTheDocument();
    expect(screen.getByText('2 devices')).toBeInTheDocument();
  });

  it('says the account is 18+ without printing a date of birth', async () => {
    server(listAnd([], userDetail()));
    renderAt(<App />, '/users/u1');

    expect(await screen.findByText('Confirmed 18+ at sign-up')).toBeInTheDocument();
    expect(screen.queryByText(/born|date of birth/i)).not.toBeInTheDocument();
  });

  it('badges a hidden post in the grid rather than leaving it out', async () => {
    server(listAnd([], userDetail({
      recentPosts: [
        { postId: 'p1', status: 'PUBLISHED', caption: 'One', thumbUrl: 'http://media.test/1.jpg', likeCount: 3, commentCount: 1, createdAt: '2026-10-10T09:00:00Z' },
        { postId: 'p2', status: 'HIDDEN', caption: 'Two', thumbUrl: 'http://media.test/2.jpg', likeCount: 0, commentCount: 0, createdAt: '2026-10-09T09:00:00Z' },
      ],
    })));
    renderAt(<App />, '/users/u1');

    expect(await screen.findByAltText('One')).toBeInTheDocument();
    expect(screen.getByAltText('Two')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('suspends with a reason, and says what suspending does first', async () => {
    const user = userEvent.setup();
    server((path, method) => {
      if (path === '/api/v1/admin/users/u1/suspend') return json(200, { userId: 'u1', status: 'SUSPENDED' });
      return listAnd([], userDetail())(path, method);
    });
    renderAt(<App />, '/users/u1');

    await user.click(await screen.findByRole('button', { name: 'Suspend the account' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/logs them out and hides their content/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Reason'), 'Repeated harassment');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    await waitFor(() => {
      const call = sent.find((entry) => entry.path.endsWith('/suspend'));
      expect(call?.body).toEqual({ note: 'Repeated harassment' });
    });
    expect(await screen.findByText('Account suspended')).toBeInTheDocument();
  });

  it('offers reinstating, not suspending, an account that is already suspended', async () => {
    server(listAnd([], userDetail({ status: 'SUSPENDED', suspendedAt: '2026-10-12T09:00:00Z' })));
    renderAt(<App />, '/users/u1');

    expect(await screen.findByRole('button', { name: 'Reinstate the account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend the account' })).not.toBeInTheDocument();
  });

  it('revokes sessions with a note, and says it is not a suspension', async () => {
    const user = userEvent.setup();
    server((path, method) => {
      if (path === '/api/v1/admin/users/u1/revoke-sessions') return json(200, { revokedSessions: 2 });
      return listAnd([], userDetail())(path, method);
    });
    renderAt(<App />, '/users/u1');

    await user.click(await screen.findByRole('button', { name: 'Revoke all sessions' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/does not suspend the account/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Reason'), 'Shared password');
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));

    await waitFor(() => {
      const call = sent.find((entry) => entry.path.endsWith('/revoke-sessions'));
      // The note alone: this endpoint takes no report id.
      expect(call?.body).toEqual({ note: 'Shared password' });
    });
  });

  it('cannot revoke sessions on an account that is signed in nowhere', async () => {
    server(listAnd([], userDetail({ activeSessions: 0 })));
    renderAt(<App />, '/users/u1');

    expect(await screen.findByRole('button', { name: 'Revoke all sessions' })).toBeDisabled();
    expect(screen.getByText('They are not signed in anywhere.')).toBeInTheDocument();
  });

  it('links the reports against them to the reports they came from', async () => {
    server(listAnd([], userDetail({
      reportsAgainst: [{ reportId: 'r1', status: 'OPEN', reason: 'HARASSMENT', targetType: 'COMMENT', createdAt: '2026-10-13T09:00:00Z' }],
    })));
    renderAt(<App />, '/users/u1');

    expect(await screen.findByRole('link', { name: /2 days ago/ })).toHaveAttribute('href', '/reports/r1');
    expect(screen.getByText('Harassment')).toBeInTheDocument();
  });
});
