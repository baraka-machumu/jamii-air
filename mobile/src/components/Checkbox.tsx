import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/** Checkbox with its label as part of the touch target (Design Brief §6 Inputs). */
export function Checkbox({ checked, onChange, label, error }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  error?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.root}>
      <Pressable onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }}
        accessibilityHint={error} style={styles.row}>
        <View style={[styles.box, {
          borderRadius: radius.sm / 2,
          borderColor: error ? colors.danger : checked ? colors.primary : colors.textMuted,
          backgroundColor: checked ? colors.primary : 'transparent',
        }]}>
          {checked && <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={3} />}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {error && <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touchTarget },
  box: { width: 24, height: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
});
