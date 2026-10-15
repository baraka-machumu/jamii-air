// The portal's frame (App Flow §15.1, Design Brief §13).
//
// Three bands: a sidebar that names the sections, a top bar that says where you are and who you
// are signed in as, and the content. Admins-only links are hidden for a moderator - the API
// refuses them anyway, and a dead link is worse than no link.
//
// The sidebar collapses to icons (remembered per browser) and becomes an overlay below `lg`, so
// the portal is usable on a laptop screen and does not break on a tablet. When it is collapsed,
// each icon keeps its name in a tooltip *and* in aria-label: the tooltip is the convenience, the
// label is what a screen reader and a touch user get.
import { useState } from 'react';
import {
  ChevronLeft, FileWarning, Gauge, KeyRound, LogOut, Menu, Monitor, Moon, ScrollText,
  Shield, Sun, Users, X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { SessionExpiryWarning } from '@/components/SessionExpiryWarning';
import { ToastHost } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { logout } from '@/auth/session';
import { useSession } from '@/stores/session';
import { type ThemeChoice, useTheme } from '@/stores/theme';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  superAdminOnly?: boolean;
}

/** Grouped the way the work runs: what you act on, then what you administer. */
const GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Moderation',
    items: [
      { to: '/', label: 'Dashboard', icon: Gauge },
      { to: '/reports', label: 'Reports', icon: FileWarning },
      { to: '/users', label: 'Users', icon: Users },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { to: '/invites', label: 'Invite codes', icon: KeyRound },
      { to: '/audit-log', label: 'Audit log', icon: ScrollText },
      { to: '/admins', label: 'Admins', icon: Shield, superAdminOnly: true },
    ],
  },
];

const COLLAPSE_KEY = 'jamii-admin-sidebar-collapsed';

/** The page name for the top bar: the longest matching nav path wins, so /reports/:id says Reports. */
function sectionName(pathname: string): string {
  const all = GROUPS.flatMap((group) => group.items);
  const match = all
    .filter((item) => item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (match) return match.label;
  if (pathname.startsWith('/posts')) return 'Reports';
  return 'Portal';
}

export function AppLayout() {
  const admin = useSession((s) => s.admin);
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);

  const toggleCollapsed = () => setCollapsed((on) => {
    try { localStorage.setItem(COLLAPSE_KEY, on ? '0' : '1'); } catch { /* a preference, not data */ }
    return !on;
  });

  const visible = (items: NavItem[]) => items.filter((i) => !i.superAdminOnly || admin?.role === 'SUPER_ADMIN');

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen bg-canvas">
        {/* Below lg the sidebar is an overlay; the scrim is only there when it is open. */}
        {drawer && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setDrawer(false)}
          />
        )}

        <nav
          aria-label="Sections"
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex flex-col border-r bg-sidebar transition-[width,transform] duration-200',
            'lg:static lg:translate-x-0',
            collapsed ? 'w-16' : 'w-60',
            drawer ? 'translate-x-0 shadow-raised' : '-translate-x-full',
          )}
        >
          <div className={cn('flex h-14 shrink-0 items-center gap-2 border-b', collapsed ? 'justify-center px-2' : 'px-4')}>
            <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="Jamii Air Admin, go to dashboard">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">J</span>
              {!collapsed && (
                <span className="truncate font-semibold text-brand-deep dark:text-foreground">
                  Jamii Air <span className="font-normal text-muted-foreground">Admin</span>
                </span>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-8 lg:hidden"
              aria-label="Close menu"
              onClick={() => setDrawer(false)}
            >
              <X aria-hidden className="size-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {GROUPS.map((group) => {
              const items = visible(group.items);
              if (items.length === 0) return null;
              return (
                <div key={group.heading} className="mb-4">
                  {/* Collapsed, the headings would be noise; the groups still read as groups by the gap. */}
                  {!collapsed && (
                    <h2 className="px-2 pb-1 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
                      {group.heading}
                    </h2>
                  )}
                  <ul className="space-y-0.5">
                    {items.map((item) => (
                      <li key={item.to}>
                        <SidebarLink
                          item={item}
                          collapsed={collapsed}
                          active={pathname === item.to}
                          onNavigate={() => setDrawer(false)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn('hidden w-full lg:flex', collapsed ? 'justify-center px-0' : 'justify-start')}
            >
              <ChevronLeft aria-hidden className={cn('size-4 transition-transform', collapsed && 'rotate-180')} />
              {!collapsed && <span>Collapse</span>}
            </Button>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-sm sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}>
              <Menu aria-hidden className="size-4" />
            </Button>
            {/* Where you are. The screen below still owns its own <h1>. */}
            <span className="truncate font-medium">{sectionName(pathname)}</span>

            <div className="ml-auto flex items-center gap-2">
              <ThemeMenu />
              {admin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 px-2" aria-label={`Account: ${admin.displayName}`}>
                      <span aria-hidden className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold">
                        {admin.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                        <span className="truncate font-medium">{admin.displayName}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {admin.role === 'SUPER_ADMIN' ? 'Super-admin' : 'Moderator'}
                        </span>
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{admin.email}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void logout()}>
                      <LogOut aria-hidden />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>

          <SessionExpiryWarning />
          <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
          {/* One host for the whole portal: a mutation inside a dialog confirms through it without
              the screen that opened the dialog knowing about it. */}
          <ToastHost />
        </div>
      </div>
    </TooltipProvider>
  );
}

function SidebarLink({ item, collapsed, active, onNavigate }: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  /** Below lg the sidebar is an overlay, so following a link has to close it behind you. */
  onNavigate: () => void;
}) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) => cn(
        'flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors',
        collapsed && 'justify-center px-0',
        isActive
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-foreground/80 hover:bg-secondary hover:text-foreground',
      )}
    >
      <item.icon aria-hidden className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function ThemeMenu() {
  const { choice, setChoice } = useTheme();
  const current = THEMES.find((t) => t.value === choice) ?? THEMES[2]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${current.label}`}>
          <current.icon aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(value) => setChoice(value as ThemeChoice)}>
          {THEMES.map((theme) => (
            <DropdownMenuRadioItem key={theme.value} value={theme.value}>
              <theme.icon aria-hidden className="text-muted-foreground" />
              {theme.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
