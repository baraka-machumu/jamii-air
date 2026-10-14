// The blocking Update required screen (App Flow §3.3). Shown above the router once the API has
// answered 426 APP_VERSION_UNSUPPORTED: no screen in the app can work against an API that refuses
// this build, so there is no way back from here except a new build from the store.
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';
import { storeUrl, useUpdateRequired } from '@/app-version/required';
import { Button } from '@/components/Button';
import { Wordmark } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { displayFont } from '@/theme/tokens';

export function UpdateRequired({ url = storeUrl() }: { url?: string | null }) {
  const { t } = useTranslation();
  const { colors, space, scheme } = useTheme();
  const minVersion = useUpdateRequired((s) => s.minVersion);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.body} accessibilityRole="alert">
        <Wordmark accent={colors.primary} ink={scheme === 'dark' ? colors.text : colors.brandDeep} />
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: displayFont, marginTop: space.lg }]}>
          {t('update.title')}
        </Text>
        <Text muted style={[styles.center, { marginTop: space.xs }]}>{t('update.body')}</Text>
        {/* The server sends details.minVersion; an older API may not, and then the number is left out. */}
        {!!minVersion && (
          <Text variant="caption" muted style={[styles.center, { marginTop: space.xs }]}>
            {t('update.minVersion', { version: minVersion })}
          </Text>
        )}
      </View>
      <View style={{ gap: space.sm, paddingBottom: space.md }}>
        {url
          ? <Button label={t('update.openStore')} onPress={() => { void Linking.openURL(url); }} />
          : <Text variant="caption" muted style={styles.center}>{t('update.noStoreLink')}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, textAlign: 'center' },
  center: { textAlign: 'center' },
});
