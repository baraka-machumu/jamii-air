// Log in (App Flow §4.3): username or email + password. Wrong details never say which one was
// wrong (AU-06). An account scheduled for deletion can be restored by logging in (BR-AC-08).
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, type TextInput } from 'react-native';
import { api, call } from '@/api/client';
import { ApiError, errorMessage } from '@/api/errors';
import { startSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { FormMessage, FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';

export default function LogIn() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string>();
  const passwordInput = useRef<TextInput>(null);

  const login = useMutation({
    mutationFn: async (cancelDeletion: boolean) => startSession(await call(api.POST('/api/v1/auth/login', {
      body: { identifier: identifier.trim(), password, ...(cancelDeletion && { cancelDeletion }) },
    }))),
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'ACCOUNT_PENDING_DELETION') {
        const due = typeof error.details?.deletionDueAt === 'string' ? new Date(error.details.deletionDueAt) : null;
        const date = due?.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }) ?? '';
        Alert.alert(t('auth.pendingDeletionTitle'), t('auth.pendingDeletionBody', { date }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('auth.cancelDeletion'), onPress: () => login.mutate(true) },
        ]);
        return;
      }
      setMessage(errorMessage(error, t));
    },
  });

  const canSubmit = identifier.trim().length > 0 && password.length > 0;
  const submit = () => {
    if (!canSubmit) return;
    setMessage(undefined);
    login.mutate(false);
  };
  const busy = login.isPending;

  return (
    <FormScreen title={t('auth.logInTitle')} subtitle={t('auth.logInSubtitle')}>
      <TextField label={t('auth.identifier')} value={identifier} onChangeText={(v) => { setIdentifier(v); setMessage(undefined); }}
        editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username"
        returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} />
      <TextField ref={passwordInput} label={t('auth.password')} secure value={password}
        onChangeText={(v) => { setPassword(v); setMessage(undefined); }} editable={!busy} autoCapitalize="none"
        autoCorrect={false} autoComplete="current-password" textContentType="password" returnKeyType="go"
        onSubmitEditing={submit} />
      <FormMessage text={message} />
      <Button label={t('auth.logIn')} onPress={submit} loading={busy} disabled={!canSubmit} />
      <Button kind="tertiary" label={t('auth.forgotPassword')} onPress={() => router.push('/forgot-password')} />
    </FormScreen>
  );
}
