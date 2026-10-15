// The portal's routes (App Flow §15.1). Everything but Login sits behind the session: a signed-out
// admin is sent to /login, and /login redirects into the portal once signed in, so no screen can
// be reached with no session (the API would refuse it anyway).
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { restore } from '@/auth/session';
import { AppLayout } from '@/components/AppLayout';
import Login from '@/routes/Login';
import { Placeholder } from '@/routes/placeholder';
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
        <Route index element={<Placeholder title="Dashboard" task="4.3" />} />
        <Route path="reports" element={<Placeholder title="Reports" task="4.4" />} />
        <Route path="reports/:id" element={<Placeholder title="Report" task="4.4" />} />
        <Route path="users" element={<Placeholder title="Users" task="4.5" />} />
        <Route path="users/:id" element={<Placeholder title="User" task="4.5" />} />
        <Route path="invites" element={<Placeholder title="Invite codes" task="4.6" />} />
        <Route path="audit-log" element={<Placeholder title="Audit log" task="4.6" />} />
        <Route path="admins" element={<Placeholder title="Admins" task="4.6" />} />
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
