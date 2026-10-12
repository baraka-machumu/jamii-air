// Forgot password (App Flow §4.4; BR-AC-07). Step 1 asks for the email and always answers the same
// way, so it never reveals whether an account exists (AU-06). Step 2 takes the 6-digit code from
// the email and a new password; every session is signed out, then the user logs in.
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { api, call } from '@/api/client';
import { ApiError, errorMessage } from '@/api/errors';
import { emailError, passwordError, resetCodeError } from '@/auth/validation';
import { Button } from '@/components/Button';
import { FormMessage, FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';

const CODE_ERRORS = new Set(['RESET_CODE_INVALID', 'RESET_CODE_EXPIRED', 'RESET_CODE_LOCKED']);
const PASSWORD_ERRORS = new Set(['PASSWORD_TOO_COMMON', 'PASSWORD_TOO_SHORT']);

export default function ForgotPassword() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<{ field?: 'code' | 'password'; message: string } | null>(null);

  const failed = (error: unknown) => {
    const apiCode = error instanceof ApiError ? error.code : '';
    const message = apiCode === 'RATE_LIMITED' ? t('auth.errors.tooManyAttempts') : errorMessage(error, t);
    setServer({ field: CODE_ERRORS.has(apiCode) ? 'code' : PASSWORD_ERRORS.has(apiCode) ? 'password' : undefined, message });
  };

  const sendCode = useMutation({
    mutationFn: () => call(api.POST('/api/v1/auth/password/forgot', { body: { email: email.trim() } })),
    onSuccess: () => { setStep('reset'); setSubmitted(false); },
    onError: failed,
  });
  const reset = useMutation({
    mutationFn: () => call(api.POST('/api/v1/auth/password/reset', { body: { email: email.trim(), code, newPassword: password } })),
    onSuccess: () => {
      Alert.alert(t('auth.resetDoneTitle'), t('auth.resetDoneBody'));
      router.replace('/login');
    },
    onError: failed,
  });

  const show = (key: string | undefined) => (submitted && key ? t(`auth.errors.${key}`) : undefined);
  const clear = () => server && setServer(null);

  if (step === 'email') {
    const invalid = emailError(email);
    return (
      <FormScreen title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
        <TextField label={t('auth.email')} value={email} onChangeText={(v) => { setEmail(v); clear(); }}
          error={show(invalid)} editable={!sendCode.isPending} keyboardType="email-address" autoCapitalize="none"
          autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="send"
          onSubmitEditing={() => { setSubmitted(true); if (!invalid) sendCode.mutate(); }} />
        <FormMessage text={server?.message} />
        <Button label={t('auth.sendCode')} loading={sendCode.isPending}
          onPress={() => { setSubmitted(true); if (!invalid) sendCode.mutate(); }} />
      </FormScreen>
    );
  }

  const codeInvalid = resetCodeError(code);
  const passwordInvalid = passwordError(password);
  const submitReset = () => {
    setSubmitted(true);
    if (!codeInvalid && !passwordInvalid) reset.mutate();
  };
  const busy = reset.isPending || sendCode.isPending;

  return (
    <FormScreen title={t('auth.resetTitle')} subtitle={t('auth.codeSent', { email: email.trim() })}>
      <TextField label={t('auth.code')} value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); clear(); }}
        error={server?.field === 'code' ? server.message : show(codeInvalid)} editable={!busy}
        keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
      <TextField label={t('auth.newPassword')} helper={t('auth.passwordHelper')} secure value={password}
        onChangeText={(v) => { setPassword(v); clear(); }}
        error={server?.field === 'password' ? server.message : show(passwordInvalid)} editable={!busy}
        autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword"
        returnKeyType="done" onSubmitEditing={submitReset} />
      <FormMessage text={server && !server.field ? server.message : undefined} />
      <Button label={t('auth.resetPassword')} loading={reset.isPending} disabled={sendCode.isPending} onPress={submitReset} />
      <Button kind="tertiary" label={t('auth.resendCode')} disabled={busy}
        onPress={() => { clear(); sendCode.mutate(); }} />
    </FormScreen>
  );
}
