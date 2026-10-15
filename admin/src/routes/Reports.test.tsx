// Task 4.4: the report queue and one report (App Flow §15.4). What matters is that a moderator can
// work the queue from the keyboard, that reported media is not on screen until they ask for it,
// that every action records a reason, and that two moderators cannot quietly overwrite each other.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { useSession } from '@/stores/session';
import { renderAt } from '@/test/render';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const apiError = (status: number, code: string) => json(status, { error: { code, message: code } });

const reportItem = (overrides: Record<string, unknown> = {}) => ({
  reportId: 'r1',
  status: 'OPEN',
  targetType: 'POST',
  reason: 'NUDITY',
  details: 'This is explicit.',
  createdAt: '2026-10-11T09:00:00Z',
  reporterId: 'u2',
  reporterUsername: 'amina',
  reportedUserId: 'u1',
  reportedUsername: 'juma',
  reportedUserStatus: 'ACTIVE',
  targetPostId: 'p1',
  targetCommentId: null,
  targetPreview: null,
  targetThumbUrl: null,
  openReportsOnTarget: 2,
  ...overrides,
});

const reportDetail = (overrides: Record<string, unknown> = {}) => ({
  reportId: 'r1',
  status: 'OPEN',
  targetType: 'POST',
  reason: 'NUDITY',
  details: 'This is explicit.',
  createdAt: '2026-10-11T09:00:00Z',
  resolvedAt: null,
  resolvedByName: null,
  reporterId: 'u2',
  reporterUsername: 'amina',
  reportedUserId: 'u1',
  reportedUsername: 'juma',
  reportedDisplayName: 'Juma M',
  reportedUserStatus: 'ACTIVE',
  reportedAvatarUrl: null,
  target: {
    postId: 'p1',
    status: 'PUBLISHED',
    caption: 'At the beach',
    feedUrl: 'http://media.test/p1.jpg',
    createdAt: '2026-10-10T08:00:00Z',
    hiddenAt: null,
    deletedAt: null,
  },
  otherReports: [],
  userHistory: [],
  ...overrides,
});

interface Sent { method: string; path: string; body: unknown }
let sent: Sent[];

/** A stub API that records what the portal sent, so a note or a reportId can be asserted on. */
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
    sent.push({
      method: request.method,
      path: url.pathname + url.search,
      body: raw ? (JSON.parse(raw) as unknown) : null,
    });
    return reply(url.pathname, request.method);
  }) as unknown as typeof fetch;
}

/** The queue and the detail, with everything else answered empty. */
const queueAnd = (items: unknown[], detail: unknown = reportDetail(), patch?: Response) =>
  (path: string, method: string): Response => {
    if (path === '/api/v1/admin/reports') return json(200, { items, nextCursor: null });
    if (path === '/api/v1/admin/reports/r1') {
      return method === 'PATCH' ? (patch ?? json(200, { reportId: 'r1', status: 'REVIEWING' })) : json(200, detail);
    }
    if (method !== 'GET') return json(200, {});
    return json(200, { items: [], nextCursor: null });
  };

const query = (path: string) => sent.filter((call) => call.path.startsWith(path));

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

describe('the queue', () => {
  it('asks for open reports and shows how long each has waited', async () => {
    server(queueAnd([reportItem()]));
    renderAt(<App />, '/reports');

    expect(await screen.findByText('4 days')).toBeInTheDocument();
    expect(query('/api/v1/admin/reports?')[0]!.path).toContain('status=OPEN');
    // The target already has another report against it: a moderator should see that before deciding.
    expect(screen.getByText('2 open')).toBeInTheDocument();
  });

  it('says so, cheerfully, when there is nothing to do', async () => {
    server(queueAnd([]));
    renderAt(<App />, '/reports');

    expect(await screen.findByText('No open reports 🎉')).toBeInTheDocument();
  });

  it('moves through the queue with j and k, and opens with Enter', async () => {
    const user = userEvent.setup();
    server(queueAnd([reportItem(), reportItem({ reportId: 'r2', createdAt: '2026-10-14T09:00:00Z' })]));
    renderAt(<App />, '/reports');
    await screen.findByText('4 days');

    await user.keyboard('j');
    expect(document.activeElement).toHaveAttribute('href', '/reports/r1');
    await user.keyboard('j');
    expect(document.activeElement).toHaveAttribute('href', '/reports/r2');
    await user.keyboard('k');
    expect(document.activeElement).toHaveAttribute('href', '/reports/r1');

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: /reported for nudity/i })).toBeInTheDocument();
  });

  it('leaves j and k alone while a filter is being typed into', async () => {
    const user = userEvent.setup();
    server(queueAnd([reportItem()]));
    renderAt(<App />, '/reports');
    await screen.findByText('4 days');

    const status = screen.getByLabelText('Status');
    status.focus();
    await user.keyboard('j');
    // Focus stays on the select: the shortcut must not steal a keystroke meant for it.
    expect(document.activeElement).toBe(status);
  });

  it('filters by reason in the portal, and says that is what it did', async () => {
    const user = userEvent.setup();
    server(queueAnd([reportItem(), reportItem({ reportId: 'r2', reason: 'SPAM', createdAt: '2026-10-14T09:00:00Z' })]));
    renderAt(<App />, '/reports');
    await screen.findByText('4 days');

    await user.selectOptions(screen.getByLabelText('Reason'), 'SPAM');

    // Scoped to the table: "Nudity" is also one of the filter's own options.
    const queue = within(screen.getByRole('table'));
    expect(queue.queryByText('Nudity')).not.toBeInTheDocument();
    expect(queue.getByText('Spam')).toBeInTheDocument();
    expect(screen.getByText(/applies to the 2 reports loaded so far/)).toBeInTheDocument();
    // The reason is not a server filter, so it must not have been sent as one.
    expect(query('/api/v1/admin/reports?').every((call) => !call.path.includes('reason'))).toBe(true);
  });
});

describe('one report', () => {
  it('marks itself as being reviewed when it is opened', async () => {
    server(queueAnd([reportItem()]));
    renderAt(<App />, '/reports/r1');
    await screen.findByRole('heading', { name: /reported for nudity/i });

    await waitFor(() => {
      const patch = sent.find((call) => call.method === 'PATCH');
      expect(patch?.body).toEqual({ status: 'REVIEWING' });
    });
  });

  it('does not mark a report that is already being reviewed', async () => {
    server(queueAnd([], reportDetail({ status: 'REVIEWING' })));
    renderAt(<App />, '/reports/r1');
    await screen.findByRole('heading', { name: /reported for nudity/i });

    expect(sent.some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('keeps the reported photo behind a blur until it is asked for', async () => {
    const user = userEvent.setup();
    server(queueAnd([], reportDetail()));
    renderAt(<App />, '/reports/r1');

    const photo = await screen.findByAltText('The reported photo');
    expect(photo.className).toContain('blur-2xl');

    await user.click(screen.getByRole('button', { name: /click to show/i }));
    expect(screen.getByAltText('The reported photo').className).not.toContain('blur-2xl');
  });

  it('shows the reporter, their words and the reason', async () => {
    server(queueAnd([], reportDetail()));
    renderAt(<App />, '/reports/r1');

    expect(await screen.findByText('@amina')).toBeInTheDocument();
    expect(screen.getByText('This is explicit.')).toBeInTheDocument();
    expect(screen.getByText('Nudity')).toBeInTheDocument();
  });

  it('hides a post with a reason, and resolves the report in the same call', async () => {
    const user = userEvent.setup();
    server((path, method) => {
      if (path === '/api/v1/admin/posts/p1/hide') return json(200, { postId: 'p1', status: 'HIDDEN' });
      return queueAnd([], reportDetail())(path, method);
    });
    renderAt(<App />, '/reports/r1');

    await user.click(await screen.findByRole('button', { name: 'Hide post' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/disappears for everyone/i)).toBeInTheDocument();

    // The server requires a note, so Confirm waits for one rather than failing a round trip.
    expect(within(dialog).getByRole('button', { name: 'Hide' })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'Explicit photo');
    await user.click(within(dialog).getByRole('button', { name: 'Hide' }));

    await waitFor(() => {
      const hide = sent.find((call) => call.path.endsWith('/hide'));
      expect(hide?.body).toEqual({ note: 'Explicit photo', reportId: 'r1' });
    });
    expect(await screen.findByText('Report resolved')).toBeInTheDocument();
  });

  it('can hide without closing the report', async () => {
    const user = userEvent.setup();
    server((path, method) => {
      if (path === '/api/v1/admin/posts/p1/hide') return json(200, { postId: 'p1', status: 'HIDDEN' });
      return queueAnd([], reportDetail())(path, method);
    });
    renderAt(<App />, '/reports/r1');

    await user.click(await screen.findByRole('button', { name: 'Hide post' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('Resolve the report as well'));
    await user.type(within(dialog).getByLabelText('Reason'), 'Explicit photo');
    await user.click(within(dialog).getByRole('button', { name: 'Hide' }));

    await waitFor(() => {
      const hide = sent.find((call) => call.path.endsWith('/hide'));
      expect(hide?.body).toEqual({ note: 'Explicit photo' });
    });
  });

  it('spells out what suspending does before it is confirmed', async () => {
    const user = userEvent.setup();
    server(queueAnd([], reportDetail()));
    renderAt(<App />, '/reports/r1');

    await user.click(await screen.findByRole('button', { name: 'Suspend @juma' }));

    expect(screen.getByText(/logs them out and hides their content/i)).toBeInTheDocument();
  });

  it('offers to reinstate, not suspend, an account that is already suspended', async () => {
    server(queueAnd([], reportDetail({ reportedUserStatus: 'SUSPENDED' })));
    renderAt(<App />, '/reports/r1');

    expect(await screen.findByRole('button', { name: 'Reinstate @juma' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend @juma' })).not.toBeInTheDocument();
  });

  it('says who handled it first when another admin got there already', async () => {
    const user = userEvent.setup();
    let handled = false;
    server((path, method) => {
      if (path === '/api/v1/admin/reports/r1' && method === 'PATCH') {
        if (!handled) { handled = true; return json(200, { reportId: 'r1', status: 'REVIEWING' }); }
        return apiError(409, 'REPORT_ALREADY_HANDLED');
      }
      if (path === '/api/v1/admin/reports/r1') {
        return json(200, handled
          ? reportDetail({ status: 'REVIEWING', resolvedByName: 'Zawadi' })
          : reportDetail());
      }
      return json(200, { items: [], nextCursor: null });
    });
    renderAt(<App />, '/reports/r1');

    await user.click(await screen.findByRole('button', { name: 'Resolve' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'Removed the photo');
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));

    expect(await screen.findByText(/already handled by Zawadi/)).toBeInTheDocument();
  });

  it('offers no decision on a report that is already closed', async () => {
    server(queueAnd([], reportDetail({ status: 'RESOLVED', resolvedByName: 'Zawadi', resolvedAt: '2026-10-12T09:00:00Z' })));
    renderAt(<App />, '/reports/r1');

    expect(await screen.findByText(/this report is resolved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('shows the other reports on the same target and the account’s history', async () => {
    server(queueAnd([], reportDetail({
      otherReports: [{ reportId: 'r9', status: 'OPEN', reason: 'SPAM', reporterUsername: 'baraka', createdAt: '2026-10-13T09:00:00Z' }],
      userHistory: [{ action: 'HIDE_POST', note: 'Nudity', adminName: 'Zawadi', createdAt: '2026-10-09T09:00:00Z' }],
    })));
    renderAt(<App />, '/reports/r1');

    expect(await screen.findByText('@baraka')).toBeInTheDocument();
    expect(screen.getByText('Hid a post')).toBeInTheDocument();
  });

  it('reads a comment as text rather than behind a blur', async () => {
    server(queueAnd([], reportDetail({
      targetType: 'COMMENT',
      reason: 'HARASSMENT',
      target: { commentId: 'c1', postId: 'p1', body: 'Go away', createdAt: '2026-10-10T08:00:00Z', hiddenAt: null, deletedAt: null },
    })));
    renderAt(<App />, '/reports/r1');

    expect(await screen.findByText('Go away')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /click to show/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide comment' })).toBeInTheDocument();
  });

  it('says when the author has already deleted the content', async () => {
    server(queueAnd([], reportDetail({
      target: { postId: 'p1', status: 'DELETED', caption: null, deletedAt: '2026-10-12T09:00:00Z', hiddenAt: null },
    })));
    renderAt(<App />, '/reports/r1');

    expect(await screen.findByText('The author has deleted this.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide post' })).not.toBeInTheDocument();
  });
});
