import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon } from './Icon';

/** Search field (Design Brief §6 Inputs): search icon, clear button once there is text. */
export function SearchField({ value, onChangeText, ref, ...rest }: TextInputProps & { value: string; onChangeText: (text: string) => void; ref?: Ref<TextInput> }) {
  const { t } = useTranslation();
  const { colors, radius, type } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
      <Icon name="search" size={20} color={colors.textMuted} />
      <TextInput ref={ref} value={value} onChangeText={onChangeText} placeholderTextColor={colors.textMuted}
        style={[type.body, styles.input, { color: colors.text }]} autoCapitalize="none" autoCorrect={false}
        returnKeyType="search" accessibilityRole="search" {...rest} />
      {value ? (
        <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel={t('common.clear')}
          hitSlop={8} style={styles.clear}>
          <Icon name="close" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, minHeight: 44 },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 8 },
  clear: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
