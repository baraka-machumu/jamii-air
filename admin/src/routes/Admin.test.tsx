// Task 4.6: invite codes, the audit log and admin accounts (App Flow §15.6-15.8). What matters is
// that a code can be handed over, that the log is readable and filterable without being editable,
// and that the admins page cannot be used to lock the last super-admin out - including by the
// super-admin using it.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { useSession } from '@/stores/session';
import { renderAt } from '@/test/render';

const superAdmin = { id: 'a1', email: 'boss@jamiiair.test', displayName: 'Zawadi', role: 'SUPER_ADMIN' as const };
const moderator = { id: 'a2', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const invite = (overrides: Record<string, unknown> = {}) => ({
  inviteId: 'i1',
  code: 'JAMII-7KQ2',
  state: 'ACTIVE',
  maxUses: 3,
  useCount: 1,
  expiresAt: '2026-11-01T00:00:00Z',
  revokedAt: null,
  createdByName: 'Zawadi',
  createdAt: '2026-10-10T09:00:00Z',
  usedBy: [{ userId: 'u1', username: 'juma', status: 'ACTIVE', createdAt: '2026-10-11T09:00:00Z' }],
  ...overrides,
});

const auditEntry = (overrides: Record<string, unknown> = {}) => ({
  entryId: 'e1',
  source: 'MODERATION',
  action: 'SUSPEND_USER',
  adminId: 'a1',
  adminName: 'Zawadi',
  targetType: 'USER',
  targetId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  note: 'Repeated harassment',
  details: null,
  createdAt: '2026-10-14T09:00:00Z',
  ...overrides,
});

const adminAccount = (overrides: Record<string, unknown> = {}) => ({
  adminId: 'a2',
  email: 'moda@jamiiair.test',
  displayName: 'Moda',
  role: 'MODERATOR',
  status: 'ACTIVE',
  totpEnabled: true,
  locked: false,
  lastLoginAt: '2026-10-14T09:00:00Z',
  createdAt: '2026-09-01T09:00:00Z',
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

/** Whatever the screen under test needs, with everything else answered empty. */
const stack = (parts: Record<string, unknown>) => (path: string): Response => {
  if (path in parts) return json(200, parts[path]);
  return json(200, { items: [], nextCursor: null });
};

const clipboard = () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
};

beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  useSession.setState({
    status: 'signedIn', accessToken: 'token-1', admin: superAdmin, startedAt: Date.now(), notice: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('invite codes', () => {
  it('lists each code with its uses, expiry and who has used it', async () => {
    server(stack({ '/api/v1/admin/invites': { items: [invite()], nextCursor: null } }));
    renderAt(<App />, '/invites');

    expect(await screen.findByText('JAMII-7KQ2')).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@juma' })).toHaveAttribute('href', '/users/u1');
  });

  it('creates a code and shows it once, ready to copy', async () => {
    const user = userEvent.setup();
    const writeText = clipboard();
    server((path, method) => {
      if (path === '/api/v1/admin/invites' && method === 'POST') {
        return json(200, { inviteId: 'i2', code: 'JAMII-NEW1', maxUses: 2, expiresAt: null });
      }
      return stack({ '/api/v1/admin/invites': { items: [], nextCursor: null } })(path);
    });
    renderAt(<App />, '/invites');

    await user.click(await screen.findByRole('button', { name: 'Create a code' }));
    const form = screen.getByRole('dialog');
    await user.clear(within(form).getByLabelText('How many people can use it'));
    await user.type(within(form).getByLabelText('How many people can use it'), '2');
    await user.click(within(form).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('JAMII-NEW1')).toBeInTheDocument();
    await waitFor(() => {
      const call = sent.find((entry) => entry.method === 'POST');
      expect(call?.body).toEqual({ maxUses: 2 });
    });

    await user.click(screen.getByRole('button', { name: 'Copy the code' }));
    expect(writeText).toHaveBeenCalledWith('JAMII-NEW1');
  });

  it('refuses a code nobody could use', async () => {
    const user = userEvent.setup();
    server(stack({ '/api/v1/admin/invites': { items: [], nextCursor: null } }));
    renderAt(<App />, '/invites');

    await user.click(await screen.findByRole('button', { name: 'Create a code' }));
    const form = screen.getByRole('dialog');
    await user.clear(within(form).getByLabelText('How many people can use it'));
    await user.type(within(form).getByLabelText('How many people can use it'), '0');

    expect(within(form).getByText('At least one use.')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('revokes a code with a reason, and says who keeps their account', async () => {
    const user = userEvent.setup();
    server((path, method) => {
      if (path === '/api/v1/admin/invites/i1' && method === 'DELETE') {
        return json(200, { inviteId: 'i1', revokedAt: '2026-10-15T12:00:00Z' });
      }
      return stack({ '/api/v1/admin/invites': { items: [invite()], nextCursor: null } })(path);
    });
    renderAt(<App />, '/invites');

    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/keeps their account/i)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Sent to the wrong person');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      const call = sent.find((entry) => entry.method === 'DELETE');
      expect(call?.body).toEqual({ note: 'Sent to the wrong person' });
    });
  });

  it('offers no Revoke on a code that is already used up', async () => {
    server(stack({ '/api/v1/admin/invites': { items: [invite({ state: 'USED_UP', useCount: 3 })], nextCursor: null } }));
    renderAt(<App />, '/invites');

    expect(await screen.findByText('Used up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });
});

describe('the audit log', () => {
  it('shows who did what, with the note, and links to the target', async () => {
    server(stack({ '/api/v1/admin/audit-log': { items: [auditEntry()], nextCursor: null } }));
    renderAt(<App />, '/audit-log');

    expect(await screen.findByText('Zawadi')).toBeInTheDocument();
    // Scoped to the table: the action filter lists the same words as its options.
    const log = within(screen.getByRole('table'));
    expect(log.getByText('Suspended the account')).toBeInTheDocument();
    expect(log.getByText('Repeated harassment')).toBeInTheDocument();
    expect(log.getByRole('link', { name: /user aaaaaaaa/ }))
      .toHaveAttribute('href', '/users/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('sends the filters to the API', async () => {
    const user = userEvent.setup();
    server(stack({ '/api/v1/admin/audit-log': { items: [auditEntry()], nextCursor: null } }));
    renderAt(<App />, '/audit-log');
    await screen.findByText('Zawadi');

    await user.selectOptions(screen.getByLabelText('Action'), 'HIDE_POST');

    await waitFor(() => {
      expect(sent.some((call) => call.path.includes('action=HIDE_POST'))).toBe(true);
    });
  });

  it('offers the admin filter to a super-admin', async () => {
    server(stack({ '/api/v1/admin/audit-log': { items: [auditEntry()], nextCursor: null } }));
    renderAt(<App />, '/audit-log');

    expect(await screen.findByLabelText('Admin')).toBeInTheDocument();
  });

  it('does not offer it to a moderator, or ask for the admins they cannot read', async () => {
    useSession.setState({ admin: moderator });
    server(stack({ '/api/v1/admin/audit-log': { items: [auditEntry()], nextCursor: null } }));
    renderAt(<App />, '/audit-log');
    await screen.findByText('Zawadi');

    expect(screen.queryByLabelText('Admin')).not.toBeInTheDocument();
    // The super-admin-only list must not be requested on a moderator's behalf.
    expect(sent.some((call) => call.path === '/api/v1/admin/admins')).toBe(false);
  });

  it('says plainly when a filter matches nothing', async () => {
    const user = userEvent.setup();
    server(stack({ '/api/v1/admin/audit-log': { items: [], nextCursor: null } }));
    renderAt(<App />, '/audit-log');

    await user.selectOptions(await screen.findByLabelText('Action'), 'HIDE_POST');

    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument();
  });
});

describe('admin accounts', () => {
  const admins = (items: unknown[]) => stack({ '/api/v1/admin/admins': { items } });

  it('turns a moderator away rather than showing an empty page', async () => {
    useSession.setState({ admin: moderator });
    server(admins([]));
    renderAt(<App />, '/admins');

    expect(await screen.findByText('You don’t have access to this page.')).toBeInTheDocument();
    expect(sent.some((call) => call.path === '/api/v1/admin/admins')).toBe(false);
  });

  it('adds an admin and shows the one-time password once', async () => {
    const user = userEvent.setup();
    const writeText = clipboard();
    server((path, method) => {
      if (path === '/api/v1/admin/admins' && method === 'POST') {
        return json(200, { id: 'a3', temporaryPassword: 'tempo-horse-battery' });
      }
      return admins([adminAccount()])(path);
    });
    renderAt(<App />, '/admins');

    await user.click(await screen.findByRole('button', { name: 'Add an admin' }));
    const form = screen.getByRole('dialog');
    await user.type(within(form).getByLabelText('Name'), 'Neema');
    await user.type(within(form).getByLabelText('Email'), 'neema@jamiiair.test');
    await user.click(within(form).getByRole('button', { name: 'Add the admin' }));

    expect(await screen.findByText('tempo-horse-battery')).toBeInTheDocument();
    expect(screen.getByText(/only time it is shown/i)).toBeInTheDocument();
    await waitFor(() => {
      const call = sent.find((entry) => entry.method === 'POST');
      expect(call?.body).toEqual({ email: 'neema@jamiiair.test', displayName: 'Neema', role: 'MODERATOR' });
    });

    await user.click(screen.getByRole('button', { name: 'Copy the password' }));
    expect(writeText).toHaveBeenCalledWith('tempo-horse-battery');

    // Closing it is the end of it: the password is nowhere on the page afterwards.
    await user.click(screen.getByRole('button', { name: 'Done, I have it' }));
    expect(screen.queryByText('tempo-horse-battery')).not.toBeInTheDocument();
  });

  it('will not let a super-admin demote or disable themselves', async () => {
    server(admins([adminAccount({ adminId: 'a1', displayName: 'Zawadi', email: superAdmin.email, role: 'SUPER_ADMIN' })]));
    renderAt(<App />, '/admins');

    expect(await screen.findByText('(you)')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for Zawadi')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled();
  });

  it('changes a role with a reason, saying what the role carries', async () => {
    const user = userEvent.setup();
    server((path, method) => {
      if (path === '/api/v1/admin/admins/a2' && method === 'PATCH') {
        return json(200, { adminId: 'a2', role: 'SUPER_ADMIN', status: 'ACTIVE', locked: false });
      }
      return admins([adminAccount()])(path);
    });
    renderAt(<App />, '/admins');

    await user.selectOptions(await screen.findByLabelText('Role for Moda'), 'SUPER_ADMIN');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/invite codes and manage admins/i)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Taking over the pilot');
    await user.click(within(dialog).getByRole('button', { name: 'Change the role' }));

    await waitFor(() => {
      const call = sent.find((entry) => entry.method === 'PATCH');
      expect(call?.body).toEqual({ role: 'SUPER_ADMIN', note: 'Taking over the pilot' });
    });
  });

  it('offers Enable on a disabled account, and says it also unlocks', async () => {
    const user = userEvent.setup();
    server(admins([adminAccount({ status: 'DISABLED' })]));
    renderAt(<App />, '/admins');

    await user.click(await screen.findByRole('button', { name: 'Enable' }));

    expect(screen.getByText(/also unlocks the account/i)).toBeInTheDocument();
  });

  it('shows a locked account as locked, with a way to unlock it', async () => {
    server(admins([adminAccount({ locked: true })]));
    renderAt(<App />, '/admins');

    expect(await screen.findByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
  });

  it('resets 2FA with a reason, and only where there is one to reset', async () => {
    const user = userEvent.setup();
    server((path, method) => {
      if (path === '/api/v1/admin/admins/a2/reset-2fa' && method === 'POST') return json(200, {});
      return admins([adminAccount()])(path);
    });
    renderAt(<App />, '/admins');

    await user.click(await screen.findByRole('button', { name: 'Reset 2FA' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'Lost their phone');
    await user.click(within(dialog).getByRole('button', { name: 'Reset 2FA' }));

    await waitFor(() => {
      const call = sent.find((entry) => entry.path.endsWith('/reset-2fa'));
      expect(call?.body).toEqual({ note: 'Lost their phone' });
    });
  });

  it('cannot reset 2FA for an admin who has not set it up yet', async () => {
    server(admins([adminAccount({ totpEnabled: false })]));
    renderAt(<App />, '/admins');

    expect(await screen.findByText('2FA not set up yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset 2FA' })).toBeDisabled();
  });
});
