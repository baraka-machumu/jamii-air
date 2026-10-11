import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the static config. This file adds what depends on the EAS build profile
// (APP_VARIANT, set in eas.json): every variant except production may call a plain-HTTP API
// on the local network, because development runs against the API on the engineer's machine.
const variant = process.env.APP_VARIANT ?? 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ['expo-build-properties', { android: { usesCleartextTraffic: variant !== 'production' } }],
  ],
  extra: { ...config.extra, variant },
});
