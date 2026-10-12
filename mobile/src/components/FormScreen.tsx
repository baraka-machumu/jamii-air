import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { BackButton } from './BackButton';
import { Screen } from './Screen';
import { Text } from './Text';

/** A signed-out form screen: back button, title, scrolling fields that stay above the keyboard. */
export function FormScreen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <BackButton />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.lg }}
          showsVerticalScrollIndicator={false}>
          <Text variant="display" accessibilityRole="header" style={{ marginTop: space.xs }}>{title}</Text>
          {subtitle && <Text muted style={{ marginTop: space.xs }}>{subtitle}</Text>}
          <View style={{ gap: space.md, marginTop: space.lg }}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** A message for the whole form (wrong password, offline, too many attempts). */
export function FormMessage({ text, tone = 'error' }: { text?: string; tone?: 'error' | 'info' }) {
  const { colors, radius } = useTheme();
  if (!text) return null;
  const color = tone === 'error' ? colors.danger : colors.text;
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite"
      style={[styles.message, { borderColor: tone === 'error' ? colors.danger : colors.border, borderRadius: radius.sm, backgroundColor: colors.surface }]}>
      <Text color={color}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  message: { borderWidth: 1.5, padding: 12 },
});
