import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { signOut } from '@/auth/session';
import { type LanguagePref, type ThemePref, useSettings } from '@/stores/settings';

/**
 * Profile tab. Until the profile and Settings screens exist (task 3.5), it carries the language
 * and theme switches and Log out, so the foundation can be tried on a phone.
 */
export default function ProfileTab() {
  const { t } = useTranslation();
  const { language, theme, setLanguage, setTheme } = useSettings();

  return (
    <Screen>
      <Placeholder title={t('tabs.profile')} note={t('placeholder.profile')}>
        <View style={{ gap: 20 }}>
          <Segmented<LanguagePref> label={t('settings.language')} value={language} onChange={setLanguage} options={[
            { value: 'system', label: t('settings.system') },
            { value: 'en', label: t('settings.english') },
            { value: 'sw', label: t('settings.swahili') },
          ]} />
          <Segmented<ThemePref> label={t('settings.theme')} value={theme} onChange={setTheme} options={[
            { value: 'system', label: t('settings.system') },
            { value: 'light', label: t('settings.light') },
            { value: 'dark', label: t('settings.dark') },
          ]} />
          <Button kind="secondary" label={t('settings.logOut')} onPress={() => void signOut()} />
        </View>
      </Placeholder>
    </Screen>
  );
}
