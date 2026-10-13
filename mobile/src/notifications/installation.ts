// This app installation's ID (TRD §5.1 push registration): made once, kept on the phone. The API
// keys the push token by it (PUT /me/devices/:installationId), and log-out sends it so the token
// is removed with the session (App Flow §9.1: signed out → nothing delivered).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'jamii.installationId';
let cached: string | null = null;

export async function getInstallationId(): Promise<string> {
  if (cached) return cached;
  const saved = await AsyncStorage.getItem(KEY).catch(() => null);
  if (saved) return (cached = saved);
  const id = `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  cached = id;
  await AsyncStorage.setItem(KEY, id).catch(() => undefined);
  return id;
}
