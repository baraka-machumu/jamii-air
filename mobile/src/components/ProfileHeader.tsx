import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatCount } from '@/i18n/format';
import { useTheme } from '@/theme/ThemeProvider';
import { Avatar } from './Avatar';
import { Text } from './Text';

/** Profile top (App Flow §8.2–8.3): photo, posts · followers · following, name, bio. */
export function ProfileHeader({ user, followerCount, onFollowers, onFollowing, photo }: {
  user: { username: string; displayName: string | null; bio: string | null; avatarUrl: string | null; avatarLargeUrl: string | null; postCount: number; followerCount: number; followingCount: number };
  /** Shown instead of user.followerCount (an optimistic follow moves it). */
  followerCount?: number;
  onFollowers?: () => void;
  onFollowing?: () => void;
  /** A local photo shown until the uploaded one is ready. */
  photo?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { space } = useTheme();

  const count = (value: number, label: string, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label}`} style={styles.count}>
      <Text variant="bodyStrong">{formatCount(value, i18n.language)}</Text>
      <Text variant="caption" muted>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      <View style={[styles.row, { marginTop: space.sm }]}>
        <Avatar uri={photo ?? user.avatarLargeUrl ?? user.avatarUrl} name={user.displayName || user.username} />
        {count(user.postCount, t('profile.posts'))}
        {count(followerCount ?? user.followerCount, t('profile.followers'), onFollowers)}
        {count(user.followingCount, t('profile.following'), onFollowing)}
      </View>
      <View style={{ marginTop: space.sm, gap: 2 }}>
        {user.displayName ? <Text variant="bodyStrong">{user.displayName}</Text> : null}
        {user.bio ? <Text>{user.bio}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
