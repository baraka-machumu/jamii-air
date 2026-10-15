// Sign in (App Flow §15.2): email and password, then the authenticator — a 6-digit code, or on a
// first sign-in the QR code to scan first. 2FA is mandatory (TRD §8), so there is no way past it.
//
// One page with three steps rather than three routes: the challenge token lives for five minutes
// and only in memory, so a step that could be reloaded or linked to would simply be dead.
import { useState } from 'react';
import { errorMessage } from '@/api/errors';
import { enrollCode, type LoginStep, login, verifyCode } from '@/auth/session';
import { Field } from '@/components/Field';
import { QrCode } from '@/components/QrCode';
import { Button } from '@/components/ui/button';
import { useSession } from '@/stores/session';

export default function Login() {
  const notice = useSession((s) => s.notice);
  const [step, setStep] = useState<LoginStep | null>(null);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-brand-deep">Jamii Air Admin</h1>
        <p className="text-muted-foreground">Moderation portal</p>
      </div>

      {/* The notice survives into the second step, but it is about the session that ended. */}
      {notice === 'expired' && !step && (
        <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3">
          Your session expired. Please sign in again.
        </p>
      )}

      {step ? <AuthenticatorStep step={step} onRestart={() => setStep(null)} /> : <PasswordStep onNext={setStep} />}
    </main>
  );
}

function PasswordStep({ onNext }: { onNext: (step: LoginStep) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onNext(await login(email.trim(), password));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => { void submit(event); }} className="space-y-4" noValidate>
      <Field
        id="email" label="Email" type="email" autoComplete="username" autoFocus required
        value={email} onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        id="password" label="Password" type="password" autoComplete="current-password" required
        value={password} onChange={(e) => setPassword(e.target.value)}
      />
      {/* One message for both wrong email and wrong password: the portal must not confirm which
          addresses are admins. */}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function AuthenticatorStep({ step, onRestart }: { step: LoginStep; onRestart: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const enrolling = step.enrollmentRequired;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const send = enrolling ? enrollCode : verifyCode;
      await send(step.challengeToken, code.trim());
      // On success the session store flips to signedIn and App swaps this page for the portal.
    } catch (failure) {
      setError(errorMessage(failure));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => { void submit(event); }} className="space-y-4" noValidate>
      {enrolling && step.enrollment && (
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold">Set up your authenticator</h2>
            <p className="text-muted-foreground">
              Scan this with your authenticator app, then enter the code it shows.
            </p>
          </div>
          <QrCode value={step.enrollment.otpauthUrl} />
          <p className="text-muted-foreground">
            Can't scan it? Enter this key by hand:{' '}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono break-all">{step.enrollment.secret}</code>
          </p>
        </div>
      )}
      {!enrolling && (
        <div>
          <h2 className="font-semibold">Enter your code</h2>
          <p className="text-muted-foreground">The 6-digit code from your authenticator app.</p>
        </div>
      )}

      <Field
        id="code" label="6-digit code" autoFocus required
        inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*"
        className="font-mono tracking-[0.3em]"
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        error={error}
      />
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : enrolling ? 'Confirm and sign in' : 'Sign in'}
      </Button>
      {/* The challenge lasts five minutes; when it runs out the only way on is to start again. */}
      <Button type="button" variant="ghost" className="w-full" onClick={onRestart}>Start again</Button>
    </form>
  );
}
