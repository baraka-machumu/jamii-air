import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/** A screen's background and safe areas (Design Brief §8). Tab screens leave the bottom to the tab bar. */
export function Screen({ children, edges = ['top'], padded = true, style }: {
  children: ReactNode;
  edges?: Edge[];
  padded?: boolean;
  style?: ViewStyle;
}) {
  const { colors, space } = useTheme();
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.root, padded && { paddingHorizontal: space.md }, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
