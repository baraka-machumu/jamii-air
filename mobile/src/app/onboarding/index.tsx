// Onboarding step 1 after sign-up (App Flow §4.2): profile photo and bio, both optional, Skip
// always visible. Then step 2, Find people, and step 3, Notifications.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { BIO_MAX, useMe, useUpdateMe } from '@/api/me';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormScreen';
import { useAndroidKeyboardHeight } from '@/components/keyboard';
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
  // Shrink by the keyboard height on Android: KeyboardAvoidingView mis-measures under
  // edge-to-edge, which left inputs stranded behind the keyboard (src/components/keyboard.ts).
  const keyboard = useAndroidKeyboardHeight();
  const me = useMe();
  const updateMe = useUpdateMe();
  const avatar = useAvatar();
  const router = useRouter();
  const toPeople = () => router.push('/onboarding/people');
  const username = useSession((s) => s.user?.username) ?? me.data?.username ?? '';
  const [bio, setBio] = useState('');
  const [message, setMessage] = useState<string>();

  const next = () => {
    const text = bio.trim();
    if (!text) { toPeople(); return; }
    updateMe.mutate({ bio: text }, { onSuccess: toPeople, onError: (error) => setMessage(errorMessage(error, t)) });
  };

  const photo = avatar.preview ?? me.data?.avatarLargeUrl ?? me.data?.avatarUrl;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text muted variant="caption">{username ? t('onboarding.welcome', { username }) : ''}</Text>
        <Button kind="tertiary" label={t('onboarding.skip')} onPress={toPeople} style={styles.skip} />
      </View>
      <KeyboardAvoidingView style={[styles.flex, { paddingBottom: keyboard }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
