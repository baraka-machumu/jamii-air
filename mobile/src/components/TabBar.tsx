// Bottom bar (App Flow §16.1, BR-BN-02, Design Brief §15.4): Home · Udaku · + · Chat · Profile,
// icons with labels; the active tab is terracotta with a tinted fill. The + is not a tab: it opens
// the Create menu (§16.5). Tapping the active tab again scrolls it to the top (useScrollToTop).
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type Tabs from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { maxFontScale, touchTarget } from '@/theme/tokens';
import { openCreateMenu } from './CreateMenu';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { icon: IconName | 'avatar'; label: string }> = {
  index: { icon: 'home', label: 'tabs.home' },
  udaku: { icon: 'udaku', label: 'tabs.udaku' },
  chat: { icon: 'comment', label: 'tabs.chat' },
  profile: { icon: 'avatar', label: 'tabs.profile' },
};

/** The + sits after this many tabs. */
const CREATE_AFTER = 2;

export function TabBar({ state, navigation, insets }: TabBarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const tabs = state.routes.map((route, index) => {
    const tab = TABS[route.name];
    if (!tab) return null;
    const focused = state.index === index;
    const color = focused ? colors.primary : colors.textMuted;
    const label = t(tab.label);
    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    };
    return (
      <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityLabel={label}
        accessibilityState={{ selected: focused }} style={styles.tab} testID={`tab-${route.name}`}>
        {tab.icon === 'avatar' ? (
          // The ring carries this tab the way the stroke carries the others, so it uses the same
          // `color`: never transparent, which left an invisible disc (3.12.c, WCAG 3:1 for controls).
          <View style={[styles.avatar, { borderColor: color }]}>
            <View style={[styles.avatarInner, { backgroundColor: focused ? colors.brand : colors.surfaceMuted }]} />
          </View>
        ) : (
          <Icon name={tab.icon} color={color} filled={focused} fillColor={colors.primarySoft} />
        )}
        <Text color={color} maxFontSizeMultiplier={maxFontScale.compact} numberOfLines={1}
          style={[styles.label, focused && styles.labelOn]}>{label}</Text>
      </Pressable>
    );
  });

  tabs.splice(CREATE_AFTER, 0, (
    <Pressable key="create" onPress={openCreateMenu} accessibilityRole="button" accessibilityLabel={t('tabs.create')}
      style={styles.create} testID="tab-create">
      <View style={[styles.disc, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
        <Icon name="plus" size={26} color={colors.onPrimary} strokeWidth={2.5} />
      </View>
    </Pressable>
  ));

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4, paddingHorizontal: 8 },
  tab: { flex: 1, minHeight: touchTarget + 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '500' },
  labelOn: { fontWeight: '700' },
  create: { width: 72, minHeight: touchTarget + 12, alignItems: 'center', justifyContent: 'center' },
  disc: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 4,
  },
  avatar: { width: 26, height: 26, borderRadius: 999, borderWidth: 2, padding: 1.5 },
  avatarInner: { flex: 1, borderRadius: 999 },
});
