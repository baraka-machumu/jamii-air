// Task 4.2: the session's two limits (App Flow §15.2 step 5) and what a page load does with the
// refresh cookie. The server enforces the same limits; these tests are about the portal being
// honest in advance rather than failing the next click.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restore } from '@/auth/session';
import { ABSOLUTE_MS, IDLE_MS, TICK_MS, WARN_AFTER_MS } from '@/auth/timeout';
import { SessionExpiryWarning } from '@/components/SessionExpiryWarning';
import { useSession } from '@/stores/session';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };
const session = { accessToken: 'token-1', expiresIn: 900, admin };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let paths: string[];

function server(reply: (path: string) => Response) {
  paths = [];
  global.fetch = vi.fn((input: Request | string) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = new URL(url, 'http://portal.test').pathname;
    paths.push(path);
    return Promise.resolve(reply(path));
  }) as unknown as typeof fetch;
}

/** Move the clock on in tick-sized steps, as the interval would. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  useSession.setState({ status: 'signedOut', accessToken: null, admin: null, startedAt: null, notice: null });
  server(() => json(200, session));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a page load', () => {
  it('asks the refresh cookie whether a session is still running, and keeps it', async () => {
    server(() => json(200, session));
    await restore();

    expect(paths).toEqual(['/api/v1/admin/auth/refresh']);
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().admin?.displayName).toBe('Moda');
  });

  it('shows a plain Login when there is no cookie: a first visit is not an expiry', async () => {
    server(() => json(401, { error: { code: 'SESSION_EXPIRED' }, requestId: 'r-1' }));
    await restore();

    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().notice).toBeNull();
  });

  it('does not restart the 12 h clock, so a reload cannot extend a session for ever', async () => {
    const started = Date.now() - 6 * 3_600_000;
    useSession.setState({ status: 'signedIn', accessToken: 'old', admin, startedAt: started });
    await restore();
    expect(useSession.getState().startedAt).toBe(started);
  });
});

describe('the idle limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSession.getState().signIn('token-1', admin);
  });

  it('stays quiet while the admin is working', () => {
    render(<SessionExpiryWarning />);
    advance(WARN_AFTER_MS - TICK_MS);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns at 25 minutes, counting down the five that are left', () => {
    render(<SessionExpiryWarning />);
    advance(WARN_AFTER_MS + TICK_MS);

    const warning = screen.getByRole('alert');
    expect(warning).toHaveTextContent('Your session ends in 4 minutes unless you continue.');
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeInTheDocument();
  });

  it('ends the session at 30 minutes, with the notice Login shows', () => {
    render(<SessionExpiryWarning />);
    advance(IDLE_MS + TICK_MS);

    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().notice).toBe('expired');
  });

  it('is reset by what the admin does, before the warning is up', () => {
    render(<SessionExpiryWarning />);
    advance(WARN_AFTER_MS - TICK_MS * 2);
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    advance(TICK_MS * 3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is not reset by stray input once the warning is up: the admin has to answer it', () => {
    render(<SessionExpiryWarning />);
    advance(WARN_AFTER_MS + TICK_MS);
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    advance(TICK_MS);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('is extended by "Stay signed in", which also rotates the cookie', () => {
    render(<SessionExpiryWarning />);
    advance(WARN_AFTER_MS + TICK_MS);

    // fireEvent, not userEvent: userEvent waits on real timers, which are faked here.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    });

    expect(paths).toContain('/api/v1/admin/auth/refresh');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    advance(TICK_MS * 2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useSession.getState().status).toBe('signedIn');
  });
});

describe('the 12 hour limit', () => {
  beforeEach(() => vi.useFakeTimers());

  it('ends the session however busy the admin has been', () => {
    useSession.setState({
      status: 'signedIn',
      accessToken: 'token-1',
      admin,
      startedAt: Date.now() - ABSOLUTE_MS,
      notice: null,
    });
    render(<SessionExpiryWarning />);

    // Active the whole time: the idle clock is nowhere near its limit.
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    advance(TICK_MS);

    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().notice).toBe('expired');
  });
});
