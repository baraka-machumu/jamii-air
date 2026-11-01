// The Create menu behind the bottom bar's + (App Flow §16.5, BR-BN-02): Post, Story, Ocean video,
// Udaku update, Sell a product. Each item switches on in its stage (Plan K1.3 → K2–K6); until then
// it shows "Coming soon" and does nothing.
import { type Href, useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { closeSheet, openSheet } from './Sheet';
import { Text } from './Text';

interface Item {
  key: 'post' | 'story' | 'ocean' | 'udaku' | 'sell';
  icon: IconName;
  tone: 'primary' | 'brand';
  /** Where it goes; none while its stage is not built. */
  href?: Href;
}

const ITEMS: Item[] = [
  { key: 'post', icon: 'image', tone: 'primary', href: '/create' },
  { key: 'story', icon: 'story', tone: 'brand' },
  { key: 'ocean', icon: 'ocean', tone: 'brand' },
  { key: 'udaku', icon: 'udaku', tone: 'primary' },
  { key: 'sell', icon: 'tag', tone: 'primary' },
];

export function openCreateMenu(): void {
  openSheet(<CreateMenu />);
}

function CreateMenu() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  return (
    <View accessibilityViewIsModal style={{ paddingBottom: space.xs }}>
      <Text variant="title" accessibilityRole="header" style={[styles.title, { marginBottom: space.xs }]}>{t('createMenu.title')}</Text>
      {ITEMS.map((item) => <Row key={item.key} item={item} t={t} />)}
      <Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
        style={({ pressed }) => [styles.cancel, { borderColor: colors.border, marginTop: space.sm, opacity: pressed ? 0.7 : 1 }]}>
        <Text variant="button">{t('common.cancel')}</Text>
      </Pressable>
    </View>
  );
}

function Row({ item, t }: { item: Item; t: TFunction }) {
  const { colors, radius } = useTheme();
  const router = useRouter();
  const { href } = item;
  const label = t(`createMenu.${item.key}`);
  const body = href ? t(`createMenu.${item.key}Body`) : t('createMenu.soon');
  const tint = item.tone === 'brand' ? { bg: colors.brandSoft, fg: colors.brand } : { bg: colors.primarySoft, fg: colors.primary };
  return (
    <Pressable
      disabled={!href}
      onPress={() => { if (!href) return; closeSheet(); router.push(href); }}
      accessibilityRole="button" accessibilityLabel={`${label}, ${body}`} accessibilityState={{ disabled: !href }}
      testID={`create-${item.key}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.tile, { backgroundColor: tint.bg, borderRadius: radius.md, opacity: href ? 1 : 0.6 }]}>
        <Icon name={item.icon} color={tint.fg} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={href ? colors.text : colors.textMuted}>{label}</Text>
        <Text variant="caption" muted>{body}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, lineHeight: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 6 },
  tile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  cancel: { minHeight: touchTarget + 6, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
