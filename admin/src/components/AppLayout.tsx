// The portal's frame (App Flow §15.1, Design Brief §13): left sidebar, top bar with the admin's
// name, role and Log out, content capped at 1440 px. Admins-only links are hidden for a
// moderator - the API refuses them anyway, and a dead link is worse than no link.
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { SessionExpiryWarning } from '@/components/SessionExpiryWarning';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { logout } from '@/auth/session';
import { useSession } from '@/stores/session';

interface NavItem {
  to: string;
  label: string;
  superAdminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/reports', label: 'Reports' },
  { to: '/users', label: 'Users' },
  { to: '/invites', label: 'Invite codes' },
  { to: '/audit-log', label: 'Audit log' },
  { to: '/admins', label: 'Admins', superAdminOnly: true },
];

export function AppLayout() {
  const admin = useSession((s) => s.admin);
  const { pathname } = useLocation();
  const items = NAV.filter((item) => !item.superAdminOnly || admin?.role === 'SUPER_ADMIN');

  return (
    <div className="flex min-h-screen">
      <nav aria-label="Sections" className="w-56 shrink-0 border-r bg-secondary/40 p-3">
        <Link to="/" className="mb-4 block px-2 text-base font-bold text-brand-deep">
          Jamii Air <span className="font-normal text-muted-foreground">Admin</span>
        </Link>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                aria-current={pathname === item.to ? 'page' : undefined}
                className={({ isActive }) => cn(
                  'block rounded-md px-2 py-1.5 hover:bg-secondary',
                  isActive && 'bg-background font-medium shadow-sm',
                )}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b px-6">
          {admin && (
            <span className="text-muted-foreground">
              {admin.displayName} · {admin.role === 'SUPER_ADMIN' ? 'Super-admin' : 'Moderator'}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => logout()}>Log out</Button>
        </header>
        <SessionExpiryWarning />
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
