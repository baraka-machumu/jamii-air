// Placeholder for a Kidili section whose stage is not built yet (Plan K1.3): Stories, The Ocean and
// Shops on Home, the Udaku and Chat tabs. Each is replaced by the real screen in its stage (K2–K6).
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function ComingSoon({ icon, body }: { icon: IconName; body: string }) {
  const { t } = useTranslation();
  const { colors, space, radius } = useTheme();
  return (
    <View style={[styles.center, { padding: space.lg, gap: space.sm }]}>
      <View style={[styles.tile, { backgroundColor: colors.brandSoft, borderRadius: radius.lg }]}>
        <Icon name={icon} size={32} color={colors.brand} />
      </View>
      <Text variant="title" accessibilityRole="header" style={styles.text}>{t('soon.title')}</Text>
      <Text muted style={styles.text}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  tile: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
});
