// The portal's routes (App Flow §15.1). Everything but Login sits behind the session: a signed-out
// admin is sent to /login, and /login redirects into the portal once signed in, so no screen can
// be reached with no session (the API would refuse it anyway).
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { restore } from '@/auth/session';
import { AppLayout } from '@/components/AppLayout';
import Admins from '@/routes/Admins';
import AuditLog from '@/routes/AuditLog';
import Dashboard from '@/routes/Dashboard';
import Invites from '@/routes/Invites';
import Login from '@/routes/Login';
import Post from '@/routes/Post';
import Report from '@/routes/Report';
import Reports from '@/routes/Reports';
import User from '@/routes/User';
import Users from '@/routes/Users';
import { useSession } from '@/stores/session';

export function App() {
  const status = useSession((s) => s.status);

  // The access token is memory-only, so every page load asks the refresh cookie whether a session
  // is still running (App Flow §15.2). It runs once, not per route.
  useEffect(() => {
    void restore();
  }, []);

  // The access token is memory-only, so a reload has none until the refresh lands (task 4.2
  // starts it). Showing nothing for that moment avoids a flash of Login for a signed-in admin.
  if (status === 'restoring') return null;

  if (status !== 'signedIn') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<Report />} />
        <Route path="posts/:id" element={<Post />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<User />} />
        <Route path="invites" element={<Invites />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="admins" element={<Admins />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">Check the address, or pick a section on the left.</p>
    </section>
  );
}
