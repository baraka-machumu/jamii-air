// Bottom sheets (Design Brief §6 Overlays): the ⋯ action menus, Block and Report (App Flow §5,
// §8.2, §10). One host in the root layout shows whatever was opened last, so a menu row can turn
// the sheet into the Report or Block sheet in place: one modal, never two stacked (iOS cannot
// present a modal while another is closing). openSheet() / closeSheet() work from anywhere.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Text } from './Text';

const useSheet = create<{ content: ReactNode }>(() => ({ content: null }));

/** Show `content` in the sheet; replaces what is there (no close and reopen). */
export function openSheet(content: ReactNode): void {
  useSheet.setState({ content });
}

export function closeSheet(): void {
  useSheet.setState({ content: null });
}

export function SheetHost() {
  const content = useSheet((s) => s.content);
  const { colors, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={content !== null} transparent animationType="slide" onRequestClose={closeSheet} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[styles.fill, styles.backdrop]} onPress={closeSheet} importantForAccessibility="no" />
        <View testID="sheet" style={[styles.sheet, {
          backgroundColor: colors.bg, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md,
          paddingBottom: insets.bottom + space.xs, paddingHorizontal: space.md,
        }]}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {content}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/** The ⋯ menu: one row per action, then Cancel. A row closes the sheet, then runs its action
 * (which may open another sheet in its place). */
export function showActions(actions: SheetAction[], { title, cancel }: { title?: string; cancel: string }): void {
  openSheet(<ActionList actions={actions} title={title} cancel={cancel} />);
}

function ActionList({ actions, title, cancel }: { actions: SheetAction[]; title?: string; cancel: string }) {
  const { colors } = useTheme();
  const row = (label: string, onPress: () => void, color?: string) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text variant="bodyStrong" color={color}>{label}</Text>
    </Pressable>
  );
  return (
    <View accessibilityViewIsModal>
      {title ? <Text variant="caption" muted style={styles.title}>{title}</Text> : null}
      {actions.map((action) => row(action.label, () => { closeSheet(); action.onPress(); }, action.destructive ? colors.danger : undefined))}
      {row(cancel, closeSheet, colors.textMuted)}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '90%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: -2 }, elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: 8, marginBottom: 8 },
  title: { textAlign: 'center', paddingVertical: 8 },
  row: { minHeight: touchTarget + 8, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
