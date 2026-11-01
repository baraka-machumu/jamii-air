// The menu behind ☰ on My profile (App Flow §16.10): Saved and Settings. My orders and Start
// selling / My shop join it with Shops (Plan K6).
import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { closeSheet, openSheet } from './Sheet';
import { Text } from './Text';

export function openProfileMenu(): void {
  openSheet(<ProfileMenu />);
}

function ProfileMenu() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  return (
    <View accessibilityViewIsModal style={{ paddingBottom: space.xs }}>
      <Row icon="bookmark" label={t('saved.title')} body={t('saved.menuBody')} href="/saved" testID="menu-saved" />
      <Row icon="settings" label={t('settings.title')} href="/settings" testID="menu-settings" />
      <Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
        style={({ pressed }) => [styles.cancel, { borderColor: colors.border, marginTop: space.sm, opacity: pressed ? 0.7 : 1 }]}>
        <Text variant="button">{t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

function Row({ icon, label, body, href, testID }: { icon: IconName; label: string; body?: string; href: Href; testID: string }) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  return (
    <Pressable onPress={() => { closeSheet(); router.push(href); }} accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint={body} testID={testID} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.tile, { backgroundColor: colors.brandSoft, borderRadius: radius.md }]}>
        <Icon name={icon} color={colors.brand} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong">{label}</Text>
        {body ? <Text variant="caption" muted>{body}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 6 },
  tile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  cancel: { minHeight: touchTarget + 6, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
