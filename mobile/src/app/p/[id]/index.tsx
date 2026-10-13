// Post detail (App Flow §5, §13): the post on its own; from the feed it shows at once. Deleted,
// hidden or blocked → "This post is no longer available". Its comments open on their own screen
// (/p/:id/comments). The route is /p/:id, the same path as the share link (App Flow §12).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { usePost } from '@/api/posts';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { PostCard } from '@/components/PostCard';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const post = usePost(id);

  const gone = post.error instanceof ApiError && post.error.status === 404;
  let body;
  if (gone) {
    body = <View style={styles.center}><Text muted style={styles.textCenter}>{t('errors.POST_NOT_FOUND')}</Text></View>;
  } else if (!post.data) {
    body = post.isError ? (
      <View style={styles.center}>
        <Text muted style={styles.textCenter}>{errorMessage(post.error, t)}</Text>
        <Button kind="secondary" label={t('common.retry')} onPress={() => void post.refetch()} />
      </View>
    ) : <ActivityIndicator style={styles.center} color={colors.textMuted} />;
  } else {
    body = (
      <ScrollView refreshControl={<RefreshControl refreshing={post.isRefetching} onRefresh={() => void post.refetch()} />}>
        <PostCard post={post.data} followsAuthor={false} onDeleted={() => router.back()} />
      </ScrollView>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.bar}><Header title={t('feed.post')} /></View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16 },
  center: { flex: 1, justifyContent: 'center', gap: 16, padding: 16 },
  textCenter: { textAlign: 'center' },
});
