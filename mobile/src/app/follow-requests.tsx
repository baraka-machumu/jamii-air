// Follow requests (App Flow §8.5; BR-PR-07): the people asking to follow the user's private account,
// newest first, each with Confirm and Delete. Confirm makes them a follower and tells them; the row
// stays, saying so, with Follow back. Delete removes the row and tells nobody. Reached from the own
// profile, Settings and the top of Activity.
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { meKey } from '@/api/me';
import { notificationsKey } from '@/api/notifications';
import { acceptFollowRequest, declineFollowRequest, type FollowRequest, useFollowRequests } from '@/api/people';
import { Button } from '@/components/Button';
import { FollowButton } from '@/components/FollowButton';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { UserRow } from '@/components/UserRow';
import { useTheme } from '@/theme/ThemeProvider';

type Answer = 'accepted' | 'declined';

export default function FollowRequests() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const requests = useFollowRequests();
  // Answered rows keep their place until the next visit, so the list does not jump under a finger.
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const items = (requests.data?.pages.flatMap((page) => page.items) ?? []).filter((r) => answers[r.id] !== 'declined');
  const answered = (id: string, answer: Answer) => setAnswers((a) => ({ ...a, [id]: answer }));

  let body;
  if (requests.isPending) {
    body = <Spinner style={styles.center} />;
  } else if (requests.isError && items.length === 0) {
    body = (
      <View style={[styles.center, { gap: space.md }]}>
        <Text muted style={styles.textCenter}>{errorMessage(requests.error, t)}</Text>
        <Button kind="secondary" label={t('common.retry')} onPress={() => void requests.refetch()} />
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <View style={[styles.center, { gap: space.xs }]}>
        <Text variant="bodyStrong" style={styles.textCenter}>{t('privacy.noRequestsTitle')}</Text>
        <Text muted style={styles.textCenter}>{t('privacy.noRequestsBody')}</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => <RequestRow user={item} answer={answers[item.id]} onAnswered={answered} />}
        onEndReached={() => { if (requests.hasNextPage && !requests.isFetchingNextPage) void requests.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        refreshing={requests.isRefetching}
        onRefresh={() => { setAnswers({}); void requests.refetch(); }}
        ListFooterComponent={requests.isFetchingNextPage ? <ActivityIndicator style={{ padding: space.md }} color={colors.textMuted} /> : null}
      />
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={t('privacy.followRequests')} />
      {body}
    </Screen>
  );
}

function RequestRow({ user, answer, onAnswered }: {
  user: FollowRequest;
  answer: Answer | undefined;
  onAnswered: (id: string, answer: Answer) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { space } = useTheme();
  const [busy, setBusy] = useState<Answer | null>(null);

  const respond = async (next: Answer) => {
    setBusy(next);
    try {
      await (next === 'accepted' ? acceptFollowRequest(user.id) : declineFollowRequest(user.id));
      onAnswered(user.id, next);
      // The count on my profile and the "asked to follow you" rows in Activity.
      void queryClient.invalidateQueries({ queryKey: meKey });
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    } catch (error) {
      Alert.alert(t('privacy.answerFailed'), errorMessage(error, t));
    } finally {
      setBusy(null);
    }
  };

  const open = () => router.push({ pathname: '/u/[username]', params: { username: user.username } });
  const compact = { minHeight: 36, paddingHorizontal: 14 };

  return (
    <View>
      <UserRow user={user} onPress={open} right={answer === 'accepted' ? (
        user.isFollowing ? null : <FollowButton user={user} following={false} followsMe compact />
      ) : (
        <View style={[styles.actions, { gap: space.xs }]}>
          <Button label={t('privacy.confirm')} accessibilityLabel={t('privacy.confirmUser', { username: user.username })}
            loading={busy === 'accepted'} disabled={busy !== null} onPress={() => void respond('accepted')} style={compact} />
          <Button kind="secondary" label={t('privacy.delete')} accessibilityLabel={t('privacy.deleteUser', { username: user.username })}
            loading={busy === 'declined'} disabled={busy !== null} onPress={() => void respond('declined')} style={compact} />
        </View>
      )} />
      {answer === 'accepted' ? <Text variant="caption" muted style={styles.note}>{t('privacy.nowFollows')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
  textCenter: { textAlign: 'center' },
  actions: { flexDirection: 'row' },
  note: { marginLeft: 60, marginTop: -4, marginBottom: 4 },
});
