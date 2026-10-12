import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/** A Settings row: label, optional value, chevron when it opens something. */
export function ListRow({ label, value, onPress, danger, children }: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <Text color={danger ? colors.danger : undefined} style={styles.label}>{label}</Text>
      {value !== undefined && <Text muted>{value}</Text>}
      {children}
      {onPress && !danger && (
        <View style={styles.chevron}><Icon name="back" size={18} color={colors.textMuted} /></View>
      )}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>{body}</View>
  );
}

/** A group heading above rows. */
export function ListSection({ title }: { title: string }) {
  return <Text variant="caption" muted style={styles.section} accessibilityRole="header">{title.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touchTarget + 8, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { flex: 1 },
  chevron: { transform: [{ rotate: '180deg' }] },
  section: { marginTop: 24, marginBottom: 4, letterSpacing: 0.5 },
});
