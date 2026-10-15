// Login, 2FA enrollment and the 6-digit code are task 4.2 (App Flow §15.2). This page carries the
// session-expired notice already, because the API client raises it as soon as a refresh fails.
import { useSession } from '@/stores/session';

export default function Login() {
  const notice = useSession((s) => s.notice);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold text-brand-deep">Jamii Air Admin</h1>
      {notice === 'expired' && (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3">
          Your session expired. Please sign in again.
        </p>
      )}
      <p className="text-muted-foreground">Sign in is built in task 4.2.</p>
    </main>
  );
}
