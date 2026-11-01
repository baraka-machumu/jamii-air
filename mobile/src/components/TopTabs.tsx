// Segmented top tabs (Design Brief §15.4): a white pill bar with hairline dividers; the active tab
// is terracotta with a 2.5 px underline. Home's Posts · Stories · The Ocean · Shops use it.
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { maxFontScale, touchTarget } from '@/theme/tokens';
import { Text } from './Text';

export function TopTabs<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label}
      style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg - 2 }]}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Fragment key={o.value}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            <Pressable onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={o.label} testID={`home-${o.value}`} style={styles.tab}>
              <Text maxFontSizeMultiplier={maxFontScale.compact} numberOfLines={1} color={on ? colors.primary : colors.textMuted}
                style={[styles.text, on && styles.textOn, { borderBottomColor: on ? colors.primary : 'transparent' }]}>
                {o.label}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderWidth: 1, paddingHorizontal: 4, paddingVertical: 2 },
  divider: { width: StyleSheet.hairlineWidth, marginVertical: 12 },
  tab: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'flex-end' },
  text: { fontSize: 14, lineHeight: 18, fontWeight: '500', paddingBottom: 7, borderBottomWidth: 2.5 },
  textOn: { fontWeight: '700' },
});
