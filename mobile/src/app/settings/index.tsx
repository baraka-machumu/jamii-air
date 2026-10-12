// Settings (App Flow §11). Built so far: Edit profile, Change password, Language and Theme (saved on
// the phone; the language also goes to the account, so pushes and emails use it), app version and
// Log out. Notifications arrive with task 3.10; Blocked accounts and Delete account with 3.11;
// Terms, Privacy Policy and Contact support once their pages exist (Plan 5).
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View } from 'react-native';
import { useUpdateMe } from '@/api/me';
import { signOut } from '@/auth/session';
import { Header } from '@/components/Header';
import { ListRow, ListSection } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { resolveLanguage } from '@/i18n';
import { type LanguagePref, type ThemePref, useSettings } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { space } = useTheme();
  const { language, theme, setLanguage, setTheme } = useSettings();
  const updateMe = useUpdateMe();

  const changeLanguage = (next: LanguagePref) => {
    setLanguage(next);
    updateMe.mutate({ locale: resolveLanguage(next) }); // best effort: the app already switched
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
        </View>
      </ScrollView>
    </Screen>
  );
}
