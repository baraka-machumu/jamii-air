import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the static config. This file adds what depends on the EAS build profile
// (APP_VARIANT, set in eas.json): every variant except production may call a plain-HTTP API
// on the local network, because development runs against the API on the engineer's machine.
//
// APP_LINK_HOST (the share-link domain, e.g. jamiiair.co.tz; set once it exists, Plan 5.0) makes
// https://<host>/p/… and /u/… open in the app: Android App Links (verified against the backend's
// /.well-known/assetlinks.json) and iOS universal links. Without it, jamiiair:// links still work.
const variant = process.env.APP_VARIANT ?? 'development';
const linkHost = process.env.APP_LINK_HOST?.trim();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ['expo-build-properties', { android: { usesCleartextTraffic: variant !== 'production' } }],
  ],
  ...(linkHost && {
    android: {
      ...config.android,
      intentFilters: [{
        action: 'VIEW',
        autoVerify: true,
        data: ['/p/', '/u/'].map((pathPrefix) => ({ scheme: 'https', host: linkHost, pathPrefix })),
        category: ['BROWSABLE', 'DEFAULT'],
      }],
    },
    ios: { ...config.ios, associatedDomains: [`applinks:${linkHost}`] },
  }),
  extra: { ...config.extra, variant },
});
