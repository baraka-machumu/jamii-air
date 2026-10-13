// Every link the system opens the app with passes here first (Expo Router). A post or profile link
// that arrives before the user can see it (signed out, onboarding, or the session still being
// restored at launch) is remembered and opened afterwards (App Flow §12). The path itself is
// returned unchanged: when it can be shown, Expo Router opens it; when not, the guards show Welcome.
import { linkTarget, rememberLink } from '@/links/pendingLink';
import { useSession } from '@/stores/session';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const target = linkTarget(path);
    const { status, onboarding } = useSession.getState();
    if (target && (status !== 'signedIn' || onboarding)) rememberLink(target);
    return target ?? path;
  } catch {
    return '/';
  }
}
