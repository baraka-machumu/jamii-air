import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar } from './Avatar';
import { Text } from './Text';

/** A person in a list (Search, followers, Find people): avatar · username · display name. */
export function UserRow({ user, onPress, right }: {
  user: { username: string; displayName: string | null; avatarUrl: string | null };
  onPress?: () => void;
  right?: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={[styles.row, { paddingVertical: space.xs }]}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={user.username}
        style={({ pressed }) => [styles.who, { gap: space.sm, opacity: pressed ? 0.7 : 1 }]}>
        <Avatar uri={user.avatarUrl} name={user.displayName || user.username} size={48} />
        <View style={styles.names}>
          <Text variant="bodyStrong" numberOfLines={1}>{user.username}</Text>
          {user.displayName ? <Text muted numberOfLines={1}>{user.displayName}</Text> : null}
        </View>
      </Pressable>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  names: { flex: 1 },
});
