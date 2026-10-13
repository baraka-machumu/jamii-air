// Onboarding step 3 (App Flow §4.2): why notifications help ("Know when friends like your posts"),
// then Turn on → the OS permission prompt → this phone is registered for push. Not now is always
// there; Settings can turn them on later. Either way, Home next.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { enablePush } from '@/notifications/push';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';
import { displayFont } from '@/theme/tokens';

export default function NotificationsStep() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const finish = useSession((s) => s.finishOnboarding);
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
    } finally {
      setBusy(false);
      finish();
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="" />
      <View style={[styles.body, { gap: space.md }]}>
        <View style={[styles.icon, { backgroundColor: colors.surface }]}>
          <Icon name="heart" size={48} color={colors.like} filled />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: displayFont }]}>{t('onboarding.notificationsTitle')}</Text>
        <Text muted style={styles.textCenter}>{t('onboarding.notificationsBody')}</Text>
      </View>
      <View style={{ gap: space.sm, marginBottom: space.md }}>
        <Button label={t('onboarding.turnOn')} onPress={() => void turnOn()} loading={busy} />
        <Button kind="tertiary" label={t('onboarding.notNow')} onPress={finish} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, lineHeight: 34, textAlign: 'center' },
  textCenter: { textAlign: 'center' },
});
