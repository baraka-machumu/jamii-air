// Settings (App Flow §11). Built so far: Edit profile, Change password, Notifications (the
// permission status: Turn on asks the OS once, after that the row opens the phone's settings),
// Language and Theme (saved on the phone; the language also goes to the account and this phone's
// push registration, so pushes and emails use it), Blocked accounts, app version, Log out and
// Delete account (§10). Terms, Privacy Policy and Contact support once their pages exist (Plan 5).
// Private account (BR-PR-06) is a switch that says what changes before it changes it; while it is
// on, Follow requests sits under it.
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Linking, ScrollView, Switch, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { useMe, useUpdateMe } from '@/api/me';
import { signOut } from '@/auth/session';
import { Header } from '@/components/Header';
import { ListRow, ListSection } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { resolveLanguage } from '@/i18n';
import { enablePush, type PushPermission, pushPermission, registerDevice } from '@/notifications/push';
import { type LanguagePref, type ThemePref, useSettings } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const { language, theme, setLanguage, setTheme } = useSettings();
  const updateMe = useUpdateMe();
  const me = useMe();
  const isPrivate = me.data?.isPrivate ?? false;
  const [push, setPush] = useState<PushPermission | null>(null);

  // Read again when the user comes back from the phone's settings.
  const readPush = useCallback(() => { void pushPermission().then(setPush); }, []);
  useEffect(() => {
    readPush();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') readPush(); });
    return () => sub.remove();
  }, [readPush]);

  const onNotifications = () => {
    if (push === 'undetermined') void enablePush().then(setPush);
    else void Linking.openSettings();
  };

  const changeLanguage = (next: LanguagePref) => {
    setLanguage(next);
    updateMe.mutate({ locale: resolveLanguage(next) }); // best effort: the app already switched
    void registerDevice(); // this phone's pushes in the new language
  };

  const setPrivate = (next: boolean) => {
    const waiting = me.data?.followRequestCount ?? 0;
    Alert.alert(next ? t('privacy.makePrivateTitle') : t('privacy.makePublicTitle'),
      next ? t('privacy.makePrivateBody') : waiting > 0 ? t('privacy.makePublicBodyWaiting', { count: waiting }) : t('privacy.makePublicBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: next ? t('privacy.makePrivate') : t('privacy.makePublic'), onPress: () => updateMe.mutate({ isPrivate: next }, {
          onError: (error) => Alert.alert(t('privacy.switchFailed'), errorMessage(error, t)),
        }) },
      ]);
  };

  const logOut = () => Alert.alert(t('settings.logOutConfirm'), undefined, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('settings.logOut'), style: 'destructive', onPress: () => void signOut() },
  ]);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={t('settings.title')} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <ListSection title={t('settings.account')} />
        <ListRow label={t('profile.edit')} onPress={() => router.push('/edit-profile')} />
        <ListRow label={t('settings.changePassword')} onPress={() => router.push('/settings/password')} />
        {me.data ? (
          <ListRow label={t('privacy.privateAccount')}>
            <Switch value={updateMe.isPending && updateMe.variables?.isPrivate !== undefined ? updateMe.variables.isPrivate : isPrivate}
              onValueChange={setPrivate} disabled={updateMe.isPending} accessibilityLabel={t('privacy.privateAccount')}
              trackColor={{ true: colors.primary, false: colors.border }} />
          </ListRow>
        ) : null}
        {isPrivate ? (
          <ListRow label={t('privacy.followRequests')} value={String(me.data?.followRequestCount ?? 0)}
            onPress={() => router.push('/follow-requests')} />
        ) : null}
        {push && push !== 'unavailable' && (
          <ListRow label={t('settings.notifications')} onPress={onNotifications}
            value={push === 'granted' ? t('settings.notificationsOn') : push === 'denied' ? t('settings.notificationsOff') : t('onboarding.turnOn')} />
        )}
        <ListRow label={t('safety.blockedAccounts')} onPress={() => router.push('/settings/blocked')} />

        <ListSection title={t('settings.preferences')} />
        <View style={{ gap: space.md, paddingTop: space.xs }}>
          <Segmented<LanguagePref> label={t('settings.language')} value={language} onChange={changeLanguage} options={[
            { value: 'system', label: t('settings.system') },
            { value: 'en', label: t('settings.english') },
            { value: 'sw', label: t('settings.swahili') },
          ]} />
          <Segmented<ThemePref> label={t('settings.theme')} value={theme} onChange={setTheme} options={[
            { value: 'system', label: t('settings.system') },
            { value: 'light', label: t('settings.light') },
            { value: 'dark', label: t('settings.dark') },
          ]} />
        </View>

        <ListSection title={t('settings.about')} />
        <ListRow label={t('settings.appVersion')} value={Constants.expoConfig?.version ?? '—'} />

        <View style={{ marginTop: space.lg }}>
          <ListRow label={t('settings.logOut')} onPress={logOut} danger />
          <ListRow label={t('safety.deleteAccount')} onPress={() => router.push('/settings/delete-account')} danger />
        </View>
      </ScrollView>
    </Screen>
  );
}
