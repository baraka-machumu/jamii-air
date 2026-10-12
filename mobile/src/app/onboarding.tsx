// Onboarding step 1 after sign-up (App Flow §4.2): profile photo and bio, both optional, Skip
// always visible. Find people (task 3.6) and Notifications (task 3.10) become steps 2 and 3; until
// then Continue opens Home.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { BIO_MAX, useMe, useUpdateMe } from '@/api/me';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormScreen';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAvatar } from '@/media/useAvatar';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';
import { displayFont } from '@/theme/tokens';

export default function Onboarding() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const me = useMe();
  const updateMe = useUpdateMe();
  const avatar = useAvatar();
  const finish = useSession((s) => s.finishOnboarding);
  const username = useSession((s) => s.user?.username) ?? me.data?.username ?? '';
  const [bio, setBio] = useState('');
  const [message, setMessage] = useState<string>();

  const next = () => {
    const text = bio.trim();
    if (!text) { finish(); return; }
    updateMe.mutate({ bio: text }, { onSuccess: finish, onError: (error) => setMessage(errorMessage(error, t)) });
  };

  const photo = avatar.preview ?? me.data?.avatarLargeUrl ?? me.data?.avatarUrl;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text muted variant="caption">{username ? t('onboarding.welcome', { username }) : ''}</Text>
        <Button kind="tertiary" label={t('onboarding.skip')} onPress={finish} style={styles.skip} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}>
          <Text accessibilityRole="header" style={[styles.title, { fontFamily: displayFont }]}>{t('onboarding.photoTitle')}</Text>
          <Text muted>{t('onboarding.photoBody')}</Text>
          <Pressable onPress={() => avatar.choose(!!photo)} disabled={avatar.busy} accessibilityRole="button"
            accessibilityLabel={t('media.addPhoto')} style={styles.photo}>
            <View>
              <Avatar uri={photo} name={username} size={120} />
              {avatar.busy && <ActivityIndicator style={StyleSheet.absoluteFill} color="#FFFFFF" />}
            </View>
            <Text variant="button" color={colors.primary}>{photo ? t('media.changePhoto') : t('media.addPhoto')}</Text>
          </Pressable>
          <TextField label={t('profile.bio')} placeholder={t('onboarding.bioPlaceholder')} value={bio}
            onChangeText={(v) => { setBio(v); setMessage(undefined); }} maxLength={BIO_MAX} multiline
            helper={`${bio.length} / ${BIO_MAX}`} style={styles.bio} />
          <FormMessage text={message} />
        </ScrollView>
      </KeyboardAvoidingView>
      <Button label={t('onboarding.continue')} onPress={next} loading={updateMe.isPending} disabled={avatar.busy}
        style={{ marginBottom: space.md }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  skip: { minHeight: 40, paddingHorizontal: 8 },
  title: { fontSize: 28, lineHeight: 34 },
  photo: { alignItems: 'center', gap: 8, marginVertical: 8 },
  bio: { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 },
});
