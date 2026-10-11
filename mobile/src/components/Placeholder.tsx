import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** A screen that a later task fills in (task 3.1 builds only the frame). */
export function Placeholder({ title, note, children }: { title: string; note: string; children?: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={styles.root}>
      <Text variant="title" accessibilityRole="header" style={{ marginTop: space.md }}>{title}</Text>
      <View style={styles.center}>
        <Text muted style={styles.note}>{note}</Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: 16 },
  note: { textAlign: 'center' },
});
