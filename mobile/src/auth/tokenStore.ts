// The refresh token on the device (TRD AU-03): expo-secure-store (Android Keystore, iOS Keychain).
// The web preview (development only) has no secure store, so it keeps the token in localStorage.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'jamii.refreshToken';

const web = {
  get: async () => globalThis.localStorage?.getItem(KEY) ?? null,
  set: async (value: string) => globalThis.localStorage?.setItem(KEY, value),
  clear: async () => globalThis.localStorage?.removeItem(KEY),
};

const native = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (value: string) => SecureStore.setItemAsync(KEY, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

const store = Platform.OS === 'web' ? web : native;

export const tokenStore = {
  get: (): Promise<string | null> => store.get(),
  set: (refreshToken: string): Promise<void> => store.set(refreshToken),
  clear: (): Promise<void> => store.clear(),
};
