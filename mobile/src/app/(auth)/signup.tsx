// Sign up (App Flow §4.1; BR-AC-01, 02, 03, 06). Fields are checked as the user goes (after they
// leave a field, or on submit); an under-18 date of birth shows its message at once and disables
// Create account. Username and email availability come back from the server on submit only.
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInput } from 'react-native';
import { api, call } from '@/api/client';
import { ApiError, errorMessage } from '@/api/errors';
import type { components } from '@/api/schema';
import { track } from '@/analytics';
import { startSession } from '@/auth/session';
import { latestAdultDob, type SignUpField, type SignUpForm, signUpErrors, toIsoDate } from '@/auth/validation';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { DateField } from '@/components/DateField';
import { FormMessage, FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';

/** Server error codes that belong under one field rather than above the form. */
const FIELD_OF: Record<string, SignUpField> = {
  INVITE_INVALID: 'inviteCode',
  INVITE_NOT_FOUND: 'inviteCode',
  EMAIL_TAKEN: 'email',
  USERNAME_TAKEN: 'username',
  PASSWORD_TOO_COMMON: 'password',
  PASSWORD_TOO_SHORT: 'password',
  UNDER_MINIMUM_AGE: 'dob',
};

const EMPTY: SignUpForm = { inviteCode: '', email: '', username: '', password: '', dob: null, acceptTerms: false };

export default function SignUp() {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<SignUpForm>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<SignUpField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [server, setServer] = useState<{ field?: SignUpField; message: string } | null>(null);
  const [today] = useState(() => new Date());
  const email = useRef<TextInput>(null);
  const username = useRef<TextInput>(null);
  const password = useRef<TextInput>(null);

  const register = useMutation({
    mutationFn: async (body: components['schemas']['RegisterDto']) => {
      await startSession(await call(api.POST('/api/v1/auth/register', { body })), { newAccount: true });
      track('signup');
    },
    // Success: the session flips to signed in and the router opens onboarding.
    onError: (error) => {
      const code = error instanceof ApiError ? error.code : '';
      const message = code === 'RATE_LIMITED' ? t('auth.errors.tooManyAttempts') : errorMessage(error, t);
      setServer({ field: FIELD_OF[code], message });
    },
  });

  const errors = signUpErrors(form, today);
  const errorFor = (field: SignUpField): string | undefined => {
    if (server?.field === field) return server.message;
    const key = errors[field];
    // The age message shows as soon as a date is picked; the rest after leaving the field.
    if (key && (submitted || touched[field] || key === 'underAge')) return t(`auth.errors.${key}`);
    return undefined;
  };
  const update = <K extends SignUpField>(field: K, value: SignUpForm[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (server) setServer(null);
  };
  const touch = (field: SignUpField) => () => setTouched((s) => ({ ...s, [field]: true }));

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !form.dob) return;
    register.mutate({
      email: form.email.trim(),
      username: form.username,
      password: form.password,
      dateOfBirth: toIsoDate(form.dob),
      inviteCode: form.inviteCode.trim() || undefined,
      acceptTerms: true,
      locale: i18n.language === 'sw' ? 'sw' : 'en',
    });
  };

  const busy = register.isPending;
  return (
    <FormScreen title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')}>
      <TextField label={t('auth.inviteCode')} helper={t('auth.inviteHelper')} value={form.inviteCode}
        onChangeText={(v) => update('inviteCode', v)} error={errorFor('inviteCode')} editable={!busy}
        autoCapitalize="characters" autoCorrect={false} returnKeyType="next" submitBehavior="submit"
        onSubmitEditing={() => email.current?.focus()} />
      <TextField ref={email} label={t('auth.email')} value={form.email} onChangeText={(v) => update('email', v)}
        onBlur={touch('email')} error={errorFor('email')} editable={!busy}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        textContentType="emailAddress" returnKeyType="next" submitBehavior="submit"
        onSubmitEditing={() => username.current?.focus()} />
      <TextField ref={username} label={t('auth.username')} helper={t('auth.usernameHelper')} value={form.username}
        onChangeText={(v) => update('username', v)} onBlur={touch('username')} error={errorFor('username')}
        editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="username-new"
        textContentType="username" returnKeyType="next" submitBehavior="submit"
        onSubmitEditing={() => password.current?.focus()} />
      <TextField ref={password} label={t('auth.password')} helper={t('auth.passwordHelper')} secure
        value={form.password} onChangeText={(v) => update('password', v)} onBlur={touch('password')}
        error={errorFor('password')} editable={!busy} autoCapitalize="none" autoCorrect={false}
        autoComplete="new-password" textContentType="newPassword" />
      <DateField label={t('auth.dateOfBirth')} helper={t('auth.dobHelper')} value={form.dob}
        onChange={(d) => { update('dob', d); setTouched((s) => ({ ...s, dob: true })); }}
        initial={latestAdultDob(today)} maximumDate={today} error={errorFor('dob')} />
      <Checkbox checked={form.acceptTerms} onChange={(v) => update('acceptTerms', v)} label={t('auth.acceptTerms')}
        error={errorFor('acceptTerms')} />
      <FormMessage text={server && !server.field ? server.message : undefined} />
      <Button label={t('auth.createAccount')} onPress={submit} loading={busy} disabled={errors.dob === 'underAge'} />
    </FormScreen>
  );
}
