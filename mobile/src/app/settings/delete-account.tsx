// Delete account (App Flow §10.4; BR-AC-08): what is deleted, the 30-day grace and how to cancel →
// the password again → Delete my account → DELETE /me → signed out → Welcome says "Your account is
// scheduled for deletion" with the date. Logging in before then offers to cancel (§4.3).
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ApiError, errorMessage } from '@/api/errors';
import { deleteAccount } from '@/api/safety';
import { endLocally } from '@/auth/session';
import { Button } from '@/components/Button';
import { FormMessage, FormScreen } from '@/components/FormScreen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useTheme } from '@/theme/ThemeProvider';

export default function DeleteAccount() {
  const { t } = useTranslation();
  const { space } = useTheme();
  const [password, setPassword] = useState('');
  const [server, setServer] = useState<{ field: boolean; message: string } | null>(null);

  const remove = useMutation({
    mutationFn: () => deleteAccount(password),
    // The server already ended every session and removed the push tokens: only this phone is left.
    onSuccess: ({ deletionDueAt }) => void endLocally({ kind: 'deleted', deletionDueAt }),
    onError: (error) => {
      const wrong = error instanceof ApiError && error.code === 'INVALID_PASSWORD';
      setServer({ field: wrong, message: errorMessage(error, t) });
    },
  });
  const busy = remove.isPending;
  const submit = () => { if (password) remove.mutate(); };

  return (
    <FormScreen title={t('safety.deleteTitle')} subtitle={t('safety.deleteSubtitle')}>
      <View style={{ gap: space.xs }}>
        {(['deletePoint1', 'deletePoint2', 'deletePoint3'] as const).map((key) => (
          <Text key={key}>{'•  '}{t(`safety.${key}`)}</Text>
        ))}
      </View>
      <TextField label={t('safety.deletePassword')} secure value={password} editable={!busy}
        onChangeText={(v) => { setPassword(v); setServer(null); }} autoCapitalize="none" autoCorrect={false}
        autoComplete="current-password" textContentType="password" returnKeyType="done" onSubmitEditing={submit}
        error={server?.field ? server.message : undefined} />
      <FormMessage text={server && !server.field ? server.message : undefined} />
      <Button kind="destructive" label={t('safety.deleteConfirm')} onPress={submit} loading={busy} disabled={!password} />
    </FormScreen>
  );
}
