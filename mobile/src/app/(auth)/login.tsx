import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Button } from '@/components/Button';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';
import { useSession } from '@/stores/session';

/** Log in (App Flow §4.3): the form arrives with task 3.4. */
export default function LogIn() {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton />
      <Placeholder title={t('auth.logInTitle')} note={t('auth.comingSoon')}>
        {/* Development builds only: reach the tabs before real sign-in exists. */}
        {__DEV__ && <Button kind="secondary" label={t('auth.devContinue')} onPress={() => signIn(null)} />}
      </Placeholder>
    </Screen>
  );
}
