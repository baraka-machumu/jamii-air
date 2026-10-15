// Task 4.1: the frame and the guards. The screens themselves arrive with tasks 4.2-4.6.
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { useSession } from '@/stores/session';
import { renderAt } from '@/test/render';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };
const superAdmin = { ...admin, id: 'a2', displayName: 'Bosi', role: 'SUPER_ADMIN' as const };

beforeEach(() => {
  useSession.setState({ status: 'signedOut', accessToken: null, admin: null, notice: null });
});

describe('before signing in', () => {
  it('shows nothing while the session is still being restored, not a flash of Login', () => {
    useSession.setState({ status: 'restoring' });
    const { container } = renderAt(<App />, '/reports');
    expect(container).toBeEmptyDOMElement();
  });

  it('sends every address to Login', () => {
    renderAt(<App />, '/users/u1');
    expect(screen.getByRole('heading', { name: 'Jamii Air Admin' })).toBeInTheDocument();
  });

  it('says so when the session expired rather than looking like a fresh visit', () => {
    useSession.setState({ notice: 'expired' });
    renderAt(<App />, '/');
    expect(screen.getByRole('alert')).toHaveTextContent('Your session expired.');
  });
});

describe('once signed in', () => {
  it('opens the dashboard and keeps Login unreachable', () => {
    useSession.getState().signIn('token', admin);
    renderAt(<App />, '/login');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows the admin, their role and every section a moderator may use', () => {
    useSession.getState().signIn('token', admin);
    renderAt(<App />, '/');

    // The admin's name and role now sit on the account menu's trigger.
    expect(screen.getByRole('button', { name: 'Account: Moda' })).toBeInTheDocument();
    expect(screen.getByText('Moderator')).toBeInTheDocument();
    for (const section of ['Dashboard', 'Reports', 'Users', 'Invite codes', 'Audit log']) {
      expect(screen.getByRole('link', { name: section })).toBeInTheDocument();
    }
    // Admins management is super-admin only (App Flow §15.1): a dead link is worse than no link.
    expect(screen.queryByRole('link', { name: 'Admins' })).not.toBeInTheDocument();
  });

  it('adds Admins for a super-admin', () => {
    useSession.getState().signIn('token', superAdmin);
    renderAt(<App />, '/');
    expect(screen.getByRole('link', { name: 'Admins' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account: Bosi' })).toBeInTheDocument();
    expect(screen.getByText('Super-admin')).toBeInTheDocument();
  });

  it('marks the open section for a screen reader, not just visually', () => {
    useSession.getState().signIn('token', admin);
    renderAt(<App />, '/reports');
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
  });

  it('says a wrong address is wrong instead of showing an empty page', () => {
    useSession.getState().signIn('token', admin);
    renderAt(<App />, '/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('logs out to Login', () => {
    useSession.getState().signIn('token', admin);
    renderAt(<App />, '/');
    // Log out lives in the account menu now, so it has to be opened first. The menu is opened
    // with a pointerdown, which is the event Radix's trigger listens for, and read in the same
    // tick: `userEvent.click` sends the whole pointerdown/up/click sequence, and in jsdom the
    // trailing events reach Radix's dismiss layer as an outside click, so the menu opens and
    // shuts again within the one call. A real browser does not do this - the same menu is driven
    // by a real click in the Playwright run (e2e/exit-path.spec.ts).
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Account: Moda' }), { button: 0, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(useSession.getState().status).toBe('signedOut');
    expect(screen.getByRole('heading', { name: 'Jamii Air Admin' })).toBeInTheDocument();
  });
});
