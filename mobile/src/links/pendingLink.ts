// Deep links (App Flow §12): https://<domain>/p/{postId} and /u/{username} (the shareUrl paths),
// and jamiiair://p/{postId} (development / fallback). The routes have the same paths, so Expo
// Router opens them by itself when the user is signed in. Otherwise the guards show Welcome, and
// the link waits here until log-in or onboarding is over, then opens (src/app/_layout.tsx).
import { create } from 'zustand';

export const APP_SCHEME = 'jamiiair';

const ROUTE = /^\/(p|u)\/([^/]+)\/?$/;

/** The app route a link opens ('/p/123', '/u/amina'), or null if it is not a post or profile link. */
export function linkTarget(url: string): string | null {
  let path = url.trim();
  if (path.toLowerCase().startsWith(`${APP_SCHEME}://`)) path = `/${path.slice(APP_SCHEME.length + 3).replace(/^\/+/, '')}`;
  else if (/^https?:\/\//i.test(path)) path = path.replace(/^https?:\/\/[^/]*/i, '') || '/';
  path = path.split(/[?#]/)[0]!;
  const match = ROUTE.exec(path);
  if (!match) return null;
  try {
    return `/${match[1]}/${encodeURIComponent(decodeURIComponent(match[2]!))}`;
  } catch {
    return null; // a malformed %-escape
  }
}

/** A link that arrived while signed out (or before the session was restored). */
export const usePendingLink = create<{ path: string | null }>(() => ({ path: null }));

export function rememberLink(path: string | null): void {
  usePendingLink.setState({ path });
}
