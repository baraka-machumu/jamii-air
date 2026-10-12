import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { touchTarget } from '@/theme/tokens';
import { BackButton } from './BackButton';
import { Text } from './Text';

/** A pushed screen's top bar: back, centred title, optional action on the right. */
export function Header({ title, right, back = true, onBack }: { title: string; right?: ReactNode; back?: boolean; onBack?: () => void }) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>{back && <BackButton onPress={onBack} />}</View>
      <Text variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  side: { minWidth: touchTarget * 1.6, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 17 },
});
