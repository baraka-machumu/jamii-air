import { ActivityIndicator, Pressable, type PressableProps, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Text } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  kind?: ButtonKind;
  loading?: boolean;
}

/** Pill buttons (Design Brief §6): 52 pt tall for full-width actions, ≥ 44 pt touch target. */
export function Button({ label, kind = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const look = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: 'transparent', fg: colors.text, border: colors.border },
    tertiary: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    destructive: { bg: colors.danger, fg: colors.onPrimary, border: colors.danger },
  }[kind];
  const bg = inactive && kind !== 'tertiary' ? colors.border : look.bg;
  const fg = inactive ? colors.textMuted : look.fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={(state) => [
        styles.base,
        { backgroundColor: bg, borderColor: inactive ? bg : look.border, opacity: state.pressed ? 0.85 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text variant="button" color={fg} style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    minWidth: touchTarget,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 16, textAlign: 'center' },
});
