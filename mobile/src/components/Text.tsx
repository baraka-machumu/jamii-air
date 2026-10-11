import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypeVariant } from '@/theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Secondary text (timestamps, helper text). */
  muted?: boolean;
  color?: string;
}

/** Text in the type scale (Design Brief §4.2); scales with the OS font size. */
export function Text({ variant = 'body', muted, color, style, ...rest }: TextProps) {
  const theme = useTheme();
  const fill = color ?? (muted ? theme.colors.textMuted : theme.colors.text);
  return <RNText {...rest} style={[theme.type[variant], { color: fill }, style]} />;
}
