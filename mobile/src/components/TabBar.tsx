// Bottom tab bar (approved design): Home · Search · Create · Activity · Profile, icon-only with
// accessibility labels (Design Brief §9: Swahili labels would not fit), active tab filled.
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type Tabs from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { icon: IconName | 'avatar'; label: string }> = {
  index: { icon: 'home', label: 'tabs.home' },
  search: { icon: 'search', label: 'tabs.search' },
  create: { icon: 'create', label: 'tabs.create' },
  activity: { icon: 'heart', label: 'tabs.activity' },
  profile: { icon: 'avatar', label: 'tabs.profile' },
};

export function TabBar({ state, navigation, insets, badge }: TabBarProps & { badge?: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.bar, { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? colors.text : colors.textMuted;
        const showBadge = route.name === 'activity' && !!badge;
        const label = t(tab.label) + (showBadge ? `, ${badge}` : '');
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityLabel={label}
            accessibilityState={{ selected: focused }} style={styles.tab} testID={`tab-${route.name}`}>
            {tab.icon === 'avatar' ? (
              <View style={[styles.avatar, { borderColor: focused ? colors.text : 'transparent' }]}>
                <View style={[styles.avatarInner, { backgroundColor: colors.surface }]} />
              </View>
            ) : (
              <Icon name={tab.icon} color={color} filled={focused} size={tab.icon === 'create' ? 28 : 26}
                strokeWidth={focused && tab.icon === 'search' ? 2.75 : 2} />
            )}
            {showBadge && (
              <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.bg }]}>
                <Text variant="caption" color={colors.onPrimary} style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { minWidth: 56, minHeight: touchTarget + 8, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 999, borderWidth: 2, padding: 2 },
  avatarInner: { flex: 1, borderRadius: 999 },
  badge: { position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, lineHeight: 13, fontWeight: '700' },
});
