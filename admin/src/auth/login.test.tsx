// Task 4.2: signing in (App Flow §15.2). 2FA is mandatory, so the interesting part is the three
// steps and what each failure tells the admin.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { useSession } from '@/stores/session';
import { renderAt } from '@/test/render';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };
const session = { accessToken: 'token-1', expiresIn: 900, admin };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, code: string) => json(status, { error: { code, message: code }, requestId: 'r-1' });

interface Seen { path: string; header: string | null }
let calls: Seen[];

/** A fake API: `routes` answers by path, and every call is recorded with its CSRF header. */
function server(routes: Record<string, () => Response>) {
  global.fetch = vi.fn((input: Request | string, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = new URL(url, 'http://portal.test').pathname;
    const headers = typeof input === 'string' ? new Headers(init?.headers) : input.headers;
    calls.push({ path, header: headers.get('X-Admin-Client') });
    const route = routes[path];
    return Promise.resolve(route ? route() : fail(404, 'NOT_FOUND'));
  }) as unknown as typeof fetch;
}

/** openapi-fetch sends a Request object, so a sent body is read back from it. */
async function bodyOf(path: string): Promise<Record<string, unknown>> {
  const mock = global.fetch as unknown as { mock: { calls: [Request | string, RequestInit?][] } };
  for (const [input] of mock.mock.calls) {
    if (typeof input !== 'string' && new URL(input.url).pathname === path) {
      return await input.clone().json() as Record<string, unknown>;
    }
  }
  return {};
}

/** No live session on load, so the portal shows Login rather than hanging on "restoring". */
const noSession = { '/api/v1/admin/auth/refresh': () => fail(401, 'SESSION_EXPIRED') };

const fillPassword = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(await screen.findByLabelText('Email'), admin.email);
  await user.type(screen.getByLabelText('Password'), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
};

beforeEach(() => {
  calls = [];
  useSession.setState({ status: 'signedOut', accessToken: null, admin: null, startedAt: null, notice: null });
});

afterEach(() => vi.restoreAllMocks());

describe('the password step', () => {
  it('will not submit without both fields', async () => {
    server(noSession);
    renderAt(<App />, '/login');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('says only that the email or password is wrong, never which', async () => {
    const user = userEvent.setup();
    server({ ...noSession, '/api/v1/admin/auth/login': () => fail(401, 'INVALID_CREDENTIALS') });
    renderAt(<App />, '/login');
    await fillPassword(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByLabelText('Email')).toBeInTheDocument(); // still on step 1
  });

  it('explains a locked account, which a super-admin has to clear', async () => {
    const user = userEvent.setup();
    server({ ...noSession, '/api/v1/admin/auth/login': () => fail(403, 'ADMIN_LOCKED') });
    renderAt(<App />, '/login');
    await fillPassword(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('locked after too many failed attempts');
  });
});

describe('the authenticator step, on a later sign-in', () => {
  const step = () => json(200, { totpRequired: true, enrollmentRequired: false, challengeToken: 'chal-1' });

  it('asks for the code, then opens the portal with the session', async () => {
    const user = userEvent.setup();
    server({
      ...noSession,
      '/api/v1/admin/auth/login': step,
      '/api/v1/admin/auth/totp/verify': () => json(200, session),
    });
    renderAt(<App />, '/login');
    await fillPassword(user);

    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    expect(useSession.getState().accessToken).toBe('token-1');
    // The code travels with the challenge token from step 1, not with the password again.
    expect(await bodyOf('/api/v1/admin/auth/totp/verify')).toEqual({ challengeToken: 'chal-1', code: '123456' });
  });

  it('takes digits only, and waits for all six', async () => {
    const user = userEvent.setup();
    server({ ...noSession, '/api/v1/admin/auth/login': step });
    renderAt(<App />, '/login');
    await fillPassword(user);

    const code = await screen.findByLabelText('6-digit code');
    await user.type(code, '12ab3');
    expect(code).toHaveValue('123');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('clears a wrong code so the next one can be typed straight in', async () => {
    const user = userEvent.setup();
    server({
      ...noSession,
      '/api/v1/admin/auth/login': step,
      '/api/v1/admin/auth/totp/verify': () => fail(401, 'INVALID_TOTP'),
    });
    renderAt(<App />, '/login');
    await fillPassword(user);

    const code = await screen.findByLabelText('6-digit code');
    await user.type(code, '000000');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(code).toHaveValue('');
  });

  it('offers a fresh start when the five-minute challenge has run out', async () => {
    const user = userEvent.setup();
    server({
      ...noSession,
      '/api/v1/admin/auth/login': step,
      '/api/v1/admin/auth/totp/verify': () => fail(401, 'CHALLENGE_EXPIRED'),
    });
    renderAt(<App />, '/login');
    await fillPassword(user);
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That took too long.');
    await user.click(screen.getByRole('button', { name: 'Start again' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});

describe('the first sign-in', () => {
  const enrolling = () => json(200, {
    totpRequired: true,
    enrollmentRequired: true,
    challengeToken: 'chal-2',
    enrollment: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/JamiiAir:moda?secret=JBSWY3DPEHPK3PXP' },
  });

  it('shows the QR code and the key to type by hand, then enrolls', async () => {
    const user = userEvent.setup();
    server({
      ...noSession,
      '/api/v1/admin/auth/login': enrolling,
      '/api/v1/admin/auth/totp/enroll': () => json(200, session),
    });
    renderAt(<App />, '/login');
    await fillPassword(user);

    expect(await screen.findByRole('heading', { name: 'Set up your authenticator' })).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText('QR code for your authenticator app')).toBeInTheDocument());

    await user.type(screen.getByLabelText('6-digit code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirm and sign in' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument());
    // Enrollment, not verification: the first code confirms the authenticator was set up.
    expect(calls.map((c) => c.path)).toContain('/api/v1/admin/auth/totp/enroll');
  });
});

describe('every request the portal makes', () => {
  it('carries the header the cookie routes demand', async () => {
    const user = userEvent.setup();
    server({ ...noSession, '/api/v1/admin/auth/login': () => fail(401, 'INVALID_CREDENTIALS') });
    renderAt(<App />, '/login');
    await fillPassword(user);
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.header === '1')).toBe(true);
  });
});
