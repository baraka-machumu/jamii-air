// Welcome (App Flow §4, approved design). After a sign-out the user did not ask for, a note says
// why: the account was suspended mid-session (§13), or it is scheduled for deletion (§10.4).
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Wordmark } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useSession } from '@/stores/session';
import { type LanguagePref, useSettings } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { displayFont } from '@/theme/tokens';

export default function Welcome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, radius, space, scheme } = useTheme();
  const setLanguage = useSettings((s) => s.setLanguage);
  const notice = useSession((s) => s.notice);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={[styles.lang, { backgroundColor: colors.surface }]} accessibilityRole="radiogroup">
        {(['en', 'sw'] as const).map((code) => {
          const on = i18n.language === code;
          return (
            <Pressable key={code} onPress={() => setLanguage(code as LanguagePref)} accessibilityRole="radio"
              accessibilityState={{ checked: on }} accessibilityLabel={code === 'en' ? 'English' : 'Kiswahili'}
              style={[styles.langOption, on && { backgroundColor: colors.text }]}>
              <Text variant="button" color={on ? colors.bg : colors.text}>{code.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.body}>
        <Wordmark accent={colors.primary} ink={scheme === 'dark' ? colors.text : colors.brandDeep} />
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: displayFont, marginTop: space.lg }]}>{t('welcome.title')}</Text>
        <Text muted style={{ marginTop: space.xs }}>{t('welcome.body')}</Text>
      </View>
      {notice && (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite"
          style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, padding: space.sm, marginBottom: space.md }]}>
          <Text variant="bodyStrong">{notice.kind === 'suspended' ? t('safety.suspendedTitle') : t('safety.deletedTitle')}</Text>
          <Text muted>{notice.kind === 'suspended' ? t('errors.ACCOUNT_SUSPENDED') : t('safety.deletedBody', {
            date: new Date(notice.deletionDueAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }),
          })}</Text>
        </View>
      )}
      <View style={{ gap: space.sm, paddingBottom: space.md }}>
        <Button label={t('welcome.createAccount')} onPress={() => router.push('/signup')} />
        <Button label={t('welcome.logIn')} kind="secondary" onPress={() => router.push('/login')} />
        <Text variant="caption" muted style={styles.center}>{t('welcome.pilotNote')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lang: { alignSelf: 'flex-end', flexDirection: 'row', borderRadius: 999, padding: 3, marginTop: 8 },
  langOption: { minWidth: 44, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 30, lineHeight: 36 },
  center: { textAlign: 'center' },
  notice: { borderWidth: 1, gap: 4 },
});
