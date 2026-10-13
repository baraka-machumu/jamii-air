// Change password (App Flow §11, BR-AC-07 Should): current + new password → POST
// /auth/password/change. This phone stays signed in; every other session is signed out.
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { api, call } from '@/api/client';
import { getInstallationId } from '@/notifications/installation';
import { ApiError, errorMessage } from '@/api/errors';
import { passwordError } from '@/auth/validation';
import { Button } from '@/components/Button';
import { FormMessage, FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';

export default function ChangePassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<{ field?: 'current' | 'next'; message: string } | null>(null);

  const change = useMutation({
    // This phone's push registration stays; every other one goes with its session.
    mutationFn: async () => call(api.POST('/api/v1/auth/password/change', {
      body: { currentPassword: current, newPassword: next, installationId: await getInstallationId() },
    })),
    onSuccess: () => {
      Alert.alert(t('settings.passwordChangedTitle'), t('settings.passwordChangedBody'));
      router.back();
    },
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : '';
      const field = code === 'INVALID_PASSWORD' ? 'current' : code === 'PASSWORD_TOO_COMMON' || code === 'PASSWORD_TOO_SHORT' ? 'next' : undefined;
      setServer({ field, message: code === 'RATE_LIMITED' ? t('auth.errors.tooManyAttempts') : errorMessage(error, t) });
    },
  });

  const nextInvalid = passwordError(next);
  const submit = () => {
    setSubmitted(true);
    if (current && !nextInvalid) change.mutate();
  };
  const clear = () => server && setServer(null);
  const busy = change.isPending;

  return (
    <FormScreen title={t('settings.changePassword')} subtitle={t('settings.changePasswordSubtitle')}>
      <TextField label={t('settings.currentPassword')} secure value={current} editable={!busy}
        onChangeText={(v) => { setCurrent(v); clear(); }} autoCapitalize="none" autoCorrect={false}
        autoComplete="current-password" textContentType="password"
        error={server?.field === 'current' ? server.message : submitted && !current ? t('auth.errors.required') : undefined} />
      <TextField label={t('auth.newPassword')} helper={t('auth.passwordHelper')} secure value={next} editable={!busy}
        onChangeText={(v) => { setNext(v); clear(); }} autoCapitalize="none" autoCorrect={false}
        autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={submit}
        error={server?.field === 'next' ? server.message : submitted && nextInvalid ? t(`auth.errors.${nextInvalid}`) : undefined} />
      <FormMessage text={server && !server.field ? server.message : undefined} />
      <Button label={t('settings.changePassword')} onPress={submit} loading={busy} />
    </FormScreen>
  );
}
