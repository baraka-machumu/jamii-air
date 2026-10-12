// Root of the app: providers (server state, theme, i18n, safe areas), the brand font, and the
// routing split between signed-out screens and the tabs (App Flow §2–3). Expo Router guards the
// groups: a signed-out user can never reach (tabs) and vice versa. At launch the saved session is
// restored first (src/auth/session.ts); the splash stays up meanwhile (8 s at most).
import { Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '@/api/queryClient';
import { restoreSession } from '@/auth/session';
import i18n, { resolveLanguage } from '@/i18n';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold });
  const language = useSettings((s) => s.language);

  const status = useSession((s) => s.status);

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(language));
  }, [language]);

  useEffect(() => {
    void restoreSession();
  }, []);

  // Signing out (by the user, or a session the server ended) drops every cached response.
  useEffect(() => {
    if (status === 'signedOut') queryClient.clear();
  }, [status, queryClient]);

  // The splash screen stays up until the brand font is ready (a few ms, bundled) and the saved
  // session is restored.
  if (!fontsLoaded || status === 'restoring') return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RootStack />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const theme = useTheme();
  const signedIn = useSession((s) => s.status === 'signedIn');
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
