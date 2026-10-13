// Push notifications (App Flow §4.2 step 3, §9.1; TRD §5.1). The OS permission is asked only
// from "Turn on" (onboarding or Settings); once granted, the phone's Expo push token is
// registered for this installation (PUT /me/devices/:installationId) with the app version and
// language, and registered again at each sign-in (tokens and languages change). Android shows
// pushes on the `default` channel, the one the backend names (task 2.10).
//
// In every app state (usePushHandling, in the root layout):
//  - foreground: no system banner; a toast at the top and the badge read again;
//  - background / killed: the system shows it; a tap opens the post or profile, through the same
//    pending-link path as deep links, so it waits for log-in and lands over Home.
//
// expo-notifications is a native module added with task 3.10: on a dev build made before it the
// module is missing, pushes are "unavailable" and the rest of the app works as before.
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api, appVersion, call } from '@/api/client';
import { notificationPath, notificationsKey } from '@/api/notifications';
import { showToast } from '@/components/Toast';
import i18n, { resolveLanguage } from '@/i18n';
import { rememberLink } from '@/links/pendingLink';
import { useSettings } from '@/stores/settings';
import { getInstallationId } from './installation';

type NotificationsModule = typeof import('expo-notifications');

export const ANDROID_CHANNEL = 'default';

let loaded: NotificationsModule | null | undefined;

/** The native module, or null where it does not exist (web, dev builds made before 3.10). */
export function notificationsModule(): NotificationsModule | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = Platform.OS === 'web' ? null : (require('expo-notifications') as NotificationsModule);
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function pushPermission(): Promise<PushPermission> {
  const N = notificationsModule();
  if (!N) return 'unavailable';
  try {
    const { status } = await N.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

async function ensureChannel(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: i18n.t('notifications.channelName'),
    importance: N.AndroidImportance.HIGH,
  });
}

/** Register this phone for push if the permission is granted. Best effort: false when not done. */
export async function registerDevice(): Promise<boolean> {
  const N = notificationsModule();
  if (!N || (await pushPermission()) !== 'granted') return false;
  try {
    await ensureChannel(N);
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const installationId = await getInstallationId();
    await call(api.PUT('/api/v1/me/devices/{installationId}', {
      params: { path: { installationId } },
      body: {
        token,
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        appVersion,
        locale: resolveLanguage(useSettings.getState().language),
      },
    }));
    return true;
  } catch {
    return false;
  }
}

/** "Turn on": ask the OS (only if not decided yet), then register. Returns the permission after. */
export async function enablePush(): Promise<PushPermission> {
  const N = notificationsModule();
  if (!N) return 'unavailable';
  let status = await pushPermission();
  if (status === 'undetermined') {
    try {
      await ensureChannel(N); // Android 13+ asks only once a channel exists
      const result = await N.requestPermissionsAsync();
      status = result.status === 'granted' ? 'granted' : result.status === 'denied' ? 'denied' : 'undetermined';
    } catch {
      return 'unavailable';
    }
  }
  if (status === 'granted') await registerDevice();
  return status;
}

type PushData = { type?: string; postId?: string; username?: string };

function pathOf(data: unknown): string | null {
  const d = (data ?? {}) as PushData;
  return d.type ? notificationPath({ type: d.type, postId: d.postId, username: d.username }) : null;
}

const handledResponses = new Set<string>();

/** Listeners for every app state; `signedIn`: register the device for this session. */
export function usePushHandling(signedIn: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const N = notificationsModule();
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
    });

    const open = (response: { notification: { request: { identifier: string; content: { data?: unknown } } } }) => {
      const { identifier, content } = response.notification.request;
      if (handledResponses.has(identifier)) return;
      handledResponses.add(identifier);
      const path = pathOf(content.data);
      if (path) rememberLink(path); // opened by the root layout as soon as the user is in
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    };

    // Killed: the tap that launched the app.
    const launch = N.getLastNotificationResponse();
    if (launch) open(launch);

    const received = N.addNotificationReceivedListener((notification) => {
      const { body, title } = notification.request.content;
      showToast(body || title || i18n.t('notifications.new'), { position: 'top' });
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    });
    const tapped = N.addNotificationResponseReceivedListener(open);
    return () => { received.remove(); tapped.remove(); };
  }, [queryClient]);

  useEffect(() => {
    if (signedIn) void registerDevice();
  }, [signedIn]);
}
