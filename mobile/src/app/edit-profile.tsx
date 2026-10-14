// Edit profile (App Flow §8.4; BR-PR-02): photo (change / remove, applied at once), display name
// (≤ 50), username (3–30, availability checked on save), bio (≤ 160). Save sends only what changed
// (PATCH /me) and goes back; leaving with unsaved text asks "Discard changes?".
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { BIO_MAX, changesOf, DISPLAY_NAME_MAX, type Me, type ProfileForm, profileFormOf, useMe, useUpdateMe } from '@/api/me';
import { usernameError } from '@/auth/validation';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormScreen';
import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAvatar } from '@/media/useAvatar';
import { useTheme } from '@/theme/ThemeProvider';

export default function EditProfile() {
  const me = useMe();
  if (!me.data) {
    return <Screen><Header title="" /><Spinner style={{ flex: 1 }} /></Screen>;
  }
  return <EditForm me={me.data} />;
}

function EditForm({ me }: { me: Me }) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, space } = useTheme();
  const updateMe = useUpdateMe();
  const avatar = useAvatar();
  const [form, setForm] = useState<ProfileForm>(() => profileFormOf(me));
  const [server, setServer] = useState<{ field?: 'username'; message: string } | null>(null);
  const leaving = useRef(false);

  const changes = changesOf(me, form);
  const dirty = Object.keys(changes).length > 0;
  const usernameInvalid = usernameError(form.username);

  // "Discard changes?" on back (button, Android back, gesture) while there is unsaved text.
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!dirty || leaving.current) return;
    event.preventDefault();
    Alert.alert(t('profile.discardTitle'), undefined, [
      { text: t('profile.keepEditing'), style: 'cancel' },
      { text: t('profile.discard'), style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
    ]);
  }), [navigation, dirty, t]);

  const set = (field: keyof ProfileForm) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setServer(null);
  };

  const save = () => {
    if (!dirty) { router.back(); return; }
    if (usernameInvalid) return;
    updateMe.mutate(changes, {
      onSuccess: () => { leaving.current = true; router.back(); },
      onError: (error) => setServer({
        field: error instanceof ApiError && error.code === 'USERNAME_TAKEN' ? 'username' : undefined,
        message: errorMessage(error, t),
      }),
    });
  };

  const photo = avatar.preview ?? me.avatarLargeUrl ?? me.avatarUrl;
  const busy = updateMe.isPending;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={t('profile.edit')} right={
        <Button kind="tertiary" label={t('common.save')} onPress={save} loading={busy}
          disabled={!!usernameInvalid} style={styles.save} />
      } />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }}>
          <Pressable onPress={() => avatar.choose(!!photo)} disabled={avatar.busy} accessibilityRole="button"
            accessibilityLabel={t('media.changePhoto')} style={styles.photo}>
            <View>
              <Avatar uri={photo} name={form.displayName || form.username} size={96} />
              {avatar.busy && <ActivityIndicator style={StyleSheet.absoluteFill} color="#FFFFFF" />}
            </View>
            <Text variant="button" color={colors.primary}>{t('media.changePhoto')}</Text>
          </Pressable>
          <TextField label={t('profile.displayName')} value={form.displayName} onChangeText={set('displayName')}
            maxLength={DISPLAY_NAME_MAX} editable={!busy} autoComplete="name" textContentType="name" />
          <TextField label={t('auth.username')} helper={t('auth.usernameHelper')} value={form.username}
            onChangeText={set('username')} editable={!busy} autoCapitalize="none" autoCorrect={false}
            error={server?.field === 'username' ? server.message : usernameInvalid ? t(`auth.errors.${usernameInvalid}`) : undefined} />
          <TextField label={t('profile.bio')} value={form.bio} onChangeText={set('bio')} maxLength={BIO_MAX}
            editable={!busy} multiline helper={`${form.bio.length} / ${BIO_MAX}`} style={styles.bio} />
          <FormMessage text={server && !server.field ? server.message : undefined} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  save: { minHeight: 40, paddingHorizontal: 8 },
  photo: { alignItems: 'center', gap: 8, marginTop: 8 },
  bio: { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 },
});
