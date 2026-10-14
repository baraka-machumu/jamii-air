import { type Ref, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { maxFontScale, touchTarget } from '@/theme/tokens';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label: string;
  /** Shown under the field in the danger colour; replaces the helper. */
  error?: string;
  helper?: string;
  /** A password: hidden, with a Show / Hide toggle. */
  secure?: boolean;
  ref?: Ref<TextInput>;
}

/** Text field with label, helper and inline error (Design Brief §6 Inputs). */
export function TextField({ label, error, helper, secure, style, ref, onFocus, onBlur, ...rest }: TextFieldProps) {
  const { t } = useTranslation();
  const { colors, radius, type } = useTheme();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.text : colors.border;

  return (
    <View style={styles.root}>
      <Text variant="caption" muted>{label}</Text>
      <View style={[styles.box, { backgroundColor: colors.surface, borderColor, borderRadius: radius.sm }]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          maxFontSizeMultiplier={maxFontScale.compact}
          accessibilityHint={error ?? helper}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && hidden}
          style={[type.body, styles.input, { color: colors.text }, style]}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} accessibilityRole="button" hitSlop={8} style={styles.toggle}
            accessibilityLabel={hidden ? t('common.showPassword') : t('common.hidePassword')}>
            <Text variant="button" color={colors.primary} maxFontSizeMultiplier={maxFontScale.compact}>
              {hidden ? t('common.show') : t('common.hide')}
            </Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text variant="caption" muted>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderWidth: 1.5 },
  input: { flex: 1, minHeight: 50, paddingHorizontal: 14 },
  toggle: { minWidth: touchTarget, minHeight: touchTarget, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
});
