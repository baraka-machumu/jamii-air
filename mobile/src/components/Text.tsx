import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { maxFontScale, type TypeVariant } from '@/theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Secondary text (timestamps, helper text). */
  muted?: boolean;
  color?: string;
}

/**
 * Text in the type scale (Design Brief §4.2); scales with the OS font size, up to the cap in
 * `maxFontScale` so it stays inside its container (task 3.12.c). Text in something of a fixed
 * height passes `maxFontSizeMultiplier={maxFontScale.compact}`.
 */
export function Text({ variant = 'body', muted, color, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const theme = useTheme();
  const fill = color ?? (muted ? theme.colors.textMuted : theme.colors.text);
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxFontScale.text}
      {...rest}
      style={[theme.type[variant], { color: fill }, style]}
    />
  );
}
