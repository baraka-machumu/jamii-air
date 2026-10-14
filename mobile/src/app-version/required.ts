// Minimum app version (App Flow §3.3, TRD API-07). Every request carries X-App-Version; when this
// build is older than the server's MIN_APP_VERSION the API answers 426 APP_VERSION_UNSUPPORTED with
// details.minVersion, and the app shows a blocking Update required screen (src/app/_layout.tsx).
//
// It is set once and never cleared: no screen in the app can work against an API that refuses it,
// and the only way out is a new build from the store. The 426 may arrive at launch (the refresh
// call) or during a session, so the gate sits above the router, not on a route.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { create } from 'zustand';

/** The version the server asks for, or null while this build is still accepted. */
export const useUpdateRequired = create<{ minVersion: string | null }>(() => ({ minVersion: null }));

export function requireUpdate(minVersion: string): void {
  if (!useUpdateRequired.getState().minVersion) useUpdateRequired.setState({ minVersion });
}

/** Test helper: the gate never clears in the app itself. */
export function resetUpdateRequired(): void {
  useUpdateRequired.setState({ minVersion: null });
}

/**
 * Where to send the user. Android: the Play Store page for this package. iOS has no store listing
 * yet (no Apple account, Plan 5.0), so there is no link to give and the screen shows none; it
 * appears as soon as `ios.appStoreId` is set in the config.
 */
export function storeUrl(
  platform: string = Platform.OS,
  config: { android?: { package?: string } | null; ios?: { appStoreId?: string } | null } | null | undefined =
    Constants.expoConfig as { android?: { package?: string }; ios?: { appStoreId?: string } } | null,
): string | null {
  if (platform === 'android') {
    const pkg = config?.android?.package;
    return pkg ? `https://play.google.com/store/apps/details?id=${pkg}` : null;
  }
  if (platform === 'ios') {
    const id = config?.ios?.appStoreId;
    return id ? `https://apps.apple.com/app/id${id}` : null;
  }
  return null;
}
