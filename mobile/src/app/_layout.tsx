// Root of the app: providers (server state, theme, i18n, safe areas), the brand font, and the
// routing split between signed-out screens and the tabs (App Flow §2–3). Expo Router guards the
// groups: a signed-out user can never reach (tabs) and vice versa. At launch the saved session is
// restored first (src/auth/session.ts); the splash stays up meanwhile (8 s at most). A post or
// profile link that arrived while signed out opens once the user is in (App Flow §12); so does the
// target of a tapped push (src/notifications/push.ts), in every app state. A build the API no
// longer supports gets the blocking Update required screen instead of the router (§3.3).
import { Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { QueryClientProvider } from '@tanstack/react-query';
import { type Href, Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '@/api/queryClient';
import { useUpdateRequired } from '@/app-version/required';
import { restoreSession } from '@/auth/session';
import { closeSheet, SheetHost } from '@/components/Sheet';
import { Toast } from '@/components/Toast';
import { UpdateRequired } from '@/components/UpdateRequired';
import { resetLikes } from '@/engagement/likes';
import i18n, { resolveLanguage } from '@/i18n';
import { rememberLink, usePendingLink } from '@/links/pendingLink';
import { usePushHandling } from '@/notifications/push';
import { useFollowStore } from '@/people/follow';
import { useRecentSearches } from '@/people/recentSearches';
import { runPosting } from '@/posting/run';
import { usePosting } from '@/posting/store';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold });
  const language = useSettings((s) => s.language);

  const status = useSession((s) => s.status);
  // 426 APP_VERSION_UNSUPPORTED from any request, including the refresh at launch (App Flow §3.3).
  const updateRequired = !!useUpdateRequired((s) => s.minVersion);

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(language));
  }, [language]);

  useEffect(() => {
    void restoreSession();
  }, []);

  // Signing out (by the user, or a session the server ended) drops every cached response.
  useEffect(() => {
    if (status !== 'signedOut') return;
    queryClient.clear();
    closeSheet();
    // Another account may sign in on this phone next: forget this one's follows and searches.
    useFollowStore.setState({ chosen: {}, pending: {} });
    resetLikes();
    useRecentSearches.getState().clear();
    usePosting.getState().discard();
  }, [status, queryClient]);

  // A post that was processing when the app closed: keep checking it (App Flow §6.1).
  useEffect(() => {
    if (status !== 'signedIn') return;
    const resume = () => {
      if (usePosting.getState().draft?.phase === 'processing') void runPosting(queryClient);
    };
    if (usePosting.persist.hasHydrated()) resume();
    return usePosting.persist.onFinishHydration(resume);
  }, [status, queryClient]);

  // The splash screen stays up until the brand font is ready (a few ms, bundled) and the saved
  // session is restored. A 426 that answered the refresh ends the wait: the gate replaces the app.
  if (!fontsLoaded || (status === 'restoring' && !updateRequired)) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          {updateRequired ? <UpdateRequired /> : <RootStack />}
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const theme = useTheme();
  const signedIn = useSession((s) => s.status === 'signedIn');
  const onboarding = useSession((s) => s.onboarding);
  useOpenPendingLink(signedIn && !onboarding);
  usePushHandling(signedIn && !onboarding);
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}>
        <Stack.Protected guard={signedIn && !onboarding}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="settings/index" />
          <Stack.Screen name="settings/password" />
          <Stack.Screen name="settings/blocked" />
          <Stack.Screen name="settings/delete-account" />
          <Stack.Screen name="u/[username]/index" />
          <Stack.Screen name="u/[username]/[list]" />
          <Stack.Screen name="compose/crop" />
          <Stack.Screen name="compose/caption" />
          <Stack.Screen name="p/[id]/index" />
          <Stack.Screen name="p/[id]/comments" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarding}>
          <Stack.Screen name="onboarding/index" />
          <Stack.Screen name="onboarding/people" />
          <Stack.Screen name="onboarding/notifications" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <SheetHost />
      <Toast />
    </>
  );
}

/** Open the link that waited for log-in or onboarding; unless it is already on screen (a link at launch). */
function useOpenPendingLink(ready: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const pending = usePendingLink((s) => s.path);
  useEffect(() => {
    if (!ready || !pending) return;
    rememberLink(null);
    if (pathname !== pending) router.push(pending as Href);
  }, [ready, pending, pathname, router]);
}
