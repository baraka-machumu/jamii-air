// Search (App Flow §8.1; BR-PR-03): the field focuses when the tab opens; 300 ms after typing stops
// the API is asked (the previous request is cancelled). An empty field shows Recent searches:
// the accounts opened from here, saved on the phone, at most 10, clearable.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Keyboard, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { type UserSummary, useUserSearch } from '@/api/people';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { UserRow } from '@/components/UserRow';
import { type RecentAccount, useRecentSearches } from '@/people/recentSearches';
import { useDebounced } from '@/people/useDebounced';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

export default function SearchTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space } = useTheme();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const query = useDebounced(text.trim());
  const search = useUserSearch(query, { enabled: query.length > 0 });
  const recent = useRecentSearches();

  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => input.current?.focus(), 250); // after the tab transition
    return () => clearTimeout(timer);
  }, []));

  const open = (user: RecentAccount | UserSummary) => {
    recent.add({ id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl });
    Keyboard.dismiss();
    router.push({ pathname: '/u/[username]', params: { username: user.username } });
  };

  const field = (
    <SearchField ref={input} value={text} onChangeText={setText} placeholder={t('search.placeholder')}
      accessibilityLabel={t('search.placeholder')} />
  );

  if (!text.trim()) {
    return (
      <Screen>
        <View style={{ paddingTop: space.xs }}>{field}</View>
        {recent.accounts.length > 0 ? (
          <FlatList data={recent.accounts} keyExtractor={(a) => a.id} keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={[styles.recentHead, { marginTop: space.md }]}>
                <Text variant="bodyStrong" accessibilityRole="header">{t('search.recent')}</Text>
                <Button kind="tertiary" label={t('search.clearAll')} onPress={recent.clear} style={styles.clearAll} />
              </View>
            }
            renderItem={({ item }) => (
              <UserRow user={item} onPress={() => open(item)} right={
                <Pressable onPress={() => recent.remove(item.id)} accessibilityRole="button" hitSlop={8}
                  accessibilityLabel={t('search.removeRecent', { username: item.username })} style={styles.remove}>
                  <Icon name="close" size={18} color={colors.textMuted} />
                </Pressable>
              } />
            )} />
        ) : (
          <View style={styles.center}><Text muted style={styles.textCenter}>{t('search.hint')}</Text></View>
        )}
      </Screen>
    );
  }

  const typing = text.trim() !== query;
  return (
    <Screen>
      <View style={{ paddingTop: space.xs }}>{field}</View>
      {search.isError && !typing ? (
        <View style={styles.center}>
          <Text muted style={styles.textCenter}>{errorMessage(search.error, t)}</Text>
          <Button kind="secondary" label={t('common.retry')} onPress={() => void search.refetch()} />
        </View>
      ) : !search.data || typing ? (
        <Spinner style={{ marginTop: space.lg }} />
      ) : search.data.items.length === 0 ? (
        <View style={styles.center}><Text muted style={styles.textCenter}>{t('search.noResults', { query })}</Text></View>
      ) : (
        <FlatList data={search.data.items} keyExtractor={(u) => u.id} keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag" contentContainerStyle={{ paddingTop: space.xs }}
          renderItem={({ item }) => <UserRow user={item} onPress={() => open(item)} />} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 16, paddingBottom: 80 },
  textCenter: { textAlign: 'center' },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearAll: { minHeight: 36, paddingHorizontal: 0 },
  remove: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
