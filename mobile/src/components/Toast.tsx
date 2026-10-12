// A short message at the bottom (Design Brief §6 Feedback): "Post deleted", "Couldn't refresh",
// "Link copied". showToast() from anywhere; one at a time, gone after 2.5 s.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

const useToast = create<{ message: string | null; id: number }>(() => ({ message: null, id: 0 }));

export function showToast(message: string): void {
  useToast.setState((s) => ({ message, id: s.id + 1 }));
}

export function Toast() {
  const { message, id } = useToast();
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => useToast.setState({ message: null }), 2_500);
    return () => clearTimeout(timer);
  }, [message, id]);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 72 }]}>
      <View accessibilityLiveRegion="polite" accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: colors.text, borderRadius: radius.md }]}>
        <Text color={colors.bg}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { paddingHorizontal: 16, paddingVertical: 10, maxWidth: 480 },
});
