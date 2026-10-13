// Settings → Blocked accounts (App Flow §10.1, §11): everyone you blocked, newest first, each with
// Unblock. Unblocking does not bring back follows. A row opens the profile (which also offers Unblock).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { type BlockedUser, useBlockedAccounts } from '@/api/safety';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { UserRow } from '@/components/UserRow';
import { useUnblock } from '@/safety/block';
import { useTheme } from '@/theme/ThemeProvider';

export default function BlockedAccounts() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const blocked = useBlockedAccounts();
  const items = blocked.data?.pages.flatMap((page) => page.items) ?? [];

  let body;
  if (blocked.isPending) {
    body = <ActivityIndicator style={styles.center} color={colors.textMuted} />;
  } else if (blocked.isError && items.length === 0) {
    body = (
      <View style={[styles.center, { gap: space.md }]}>
        <Text muted style={styles.textCenter}>{errorMessage(blocked.error, t)}</Text>
        <Button kind="secondary" label={t('common.retry')} onPress={() => void blocked.refetch()} />
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <View style={[styles.center, { gap: space.xs }]}>
        <Text variant="bodyStrong" style={styles.textCenter}>{t('safety.noBlockedTitle')}</Text>
        <Text muted style={styles.textCenter}>{t('safety.noBlockedBody')}</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(user) => user.id}
        renderItem={({ item }) => <BlockedRow user={item} />}
        onEndReached={() => { if (blocked.hasNextPage && !blocked.isFetchingNextPage) void blocked.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        refreshing={blocked.isRefetching}
        onRefresh={() => void blocked.refetch()}
        ListFooterComponent={blocked.isFetchingNextPage ? <ActivityIndicator style={{ padding: space.md }} color={colors.textMuted} /> : null}
      />
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={t('safety.blockedAccounts')} />
      {body}
    </Screen>
  );
}

function BlockedRow({ user }: { user: BlockedUser }) {
  const { t } = useTranslation();
  const router = useRouter();
  const unblock = useUnblock();
  const [busy, setBusy] = useState(false);
  const press = async () => {
    setBusy(true);
    if (!(await unblock(user))) setBusy(false); // on success the row leaves the list
  };
  return (
    <UserRow user={user} onPress={() => router.push({ pathname: '/u/[username]', params: { username: user.username } })}
      right={<Button kind="secondary" label={t('safety.unblock')} accessibilityLabel={t('safety.unblockUser', { username: user.username })}
        onPress={() => void press()} loading={busy} style={styles.button} />} />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
  textCenter: { textAlign: 'center' },
  button: { minHeight: 36, paddingHorizontal: 16 },
});
