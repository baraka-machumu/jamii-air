// A short message at the bottom (Design Brief §6 Feedback): "Post deleted", "Couldn't refresh",
// "Link copied". showToast() from anywhere; one at a time, gone after 2.5 s. A push that arrives
// while the app is open shows at the top (App Flow §9.1).
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Position = 'top' | 'bottom';

const useToast = create<{ message: string | null; id: number; position: Position }>(() => ({ message: null, id: 0, position: 'bottom' }));

export function showToast(message: string, { position = 'bottom' }: { position?: Position } = {}): void {
  useToast.setState((s) => ({ message, id: s.id + 1, position }));
}

export function hideToast(): void {
  useToast.setState({ message: null });
}

export function Toast() {
  const { message, id, position } = useToast();
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hideToast, 2_500);
    return () => clearTimeout(timer);
  }, [message, id]);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, position === 'top' ? { top: insets.top + 8 } : { bottom: insets.bottom + 72 }]}>
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
