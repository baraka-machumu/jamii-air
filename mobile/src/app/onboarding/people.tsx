// Onboarding step 2, Find people (App Flow §4.2): the newest pilot accounts (search narrows them),
// each with Follow. "Follow at least 1 person to fill your feed"; Continue (always enabled) → step 3.
// Drives the KPI "% of new users who follow someone".
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { useUserSearch } from '@/api/people';
import { Button } from '@/components/Button';
import { FollowButton } from '@/components/FollowButton';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { Text } from '@/components/Text';
import { UserRow } from '@/components/UserRow';
import { useFollowStore } from '@/people/follow';
import { useDebounced } from '@/people/useDebounced';
import { useTheme } from '@/theme/ThemeProvider';
import { displayFont } from '@/theme/tokens';

export default function FindPeople() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const query = useDebounced(text.trim());
  const people = useUserSearch(query);
  const followed = useFollowStore((s) => Object.values(s.chosen).filter(Boolean).length);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="" />
      <Text accessibilityRole="header" style={[styles.title, { fontFamily: displayFont }]}>{t('onboarding.peopleTitle')}</Text>
      <Text muted style={{ marginTop: space.xs }}>
        {followed > 0 ? t('onboarding.peopleFollowed', { count: followed }) : t('onboarding.peopleHint')}
      </Text>
      <View style={{ marginTop: space.md }}>
        <SearchField value={text} onChangeText={setText} placeholder={t('search.placeholder')} accessibilityLabel={t('search.placeholder')} />
      </View>
      {people.isError ? (
        <View style={styles.center}>
          <Text muted style={styles.textCenter}>{errorMessage(people.error, t)}</Text>
          <Button kind="secondary" label={t('common.retry')} onPress={() => void people.refetch()} />
        </View>
      ) : !people.data ? (
        <ActivityIndicator style={{ marginTop: space.lg }} color={colors.textMuted} />
      ) : (
        <FlatList data={people.data.items} keyExtractor={(u) => u.id} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingVertical: space.xs }} style={styles.flex}
          ListEmptyComponent={<Text muted style={[styles.textCenter, { marginTop: space.lg }]}>
            {query ? t('search.noResults', { query }) : t('onboarding.peopleNone')}</Text>}
          renderItem={({ item }) => <UserRow user={item} right={<FollowButton user={item} following={item.isFollowing} compact />} />} />
      )}
      <Button label={t('onboarding.continue')} onPress={() => router.push('/onboarding/notifications')} style={{ marginVertical: space.md }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 28, lineHeight: 34 },
  center: { flex: 1, justifyContent: 'center', gap: 16 },
  textCenter: { textAlign: 'center' },
});
