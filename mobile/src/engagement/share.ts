// Share and Copy link (App Flow §7.3, §8.2; BR-FD-06). Share opens the phone's share sheet with
// "{username} on Jamii Air: {shareUrl}"; Copy link puts the link on the clipboard with a toast.
// The link opens the post or profile in the app, else a landing page with store links (Plan 2.9).
import type { TFunction } from 'i18next';
import { Share } from 'react-native';
import { showToast } from '@/components/Toast';

/** The phone's share sheet. Dismissing it is not an error. */
export async function shareLink(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch {
    // The sheet could not open (rare); nothing was shared and there is nothing to fix.
  }
}

export function sharePost(post: { shareUrl: string; author: { username: string } }, t: TFunction): Promise<void> {
  return shareLink(t('share.post', { username: post.author.username, url: post.shareUrl }));
}

/**
 * Copy a link and say so. expo-clipboard is a native module that dev builds made before task 3.9
 * do not have: there it is loaded lazily, and the share sheet (which offers Copy) stands in.
 */
export async function copyLink(url: string, t: TFunction): Promise<void> {
  let clipboard: typeof import('expo-clipboard') | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
  } catch {
    clipboard = undefined;
  }
  if (!clipboard) { await shareLink(url); return; }
  await clipboard.setStringAsync(url);
  showToast(t('share.copied'));
}
