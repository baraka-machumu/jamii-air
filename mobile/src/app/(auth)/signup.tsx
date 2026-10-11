import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';

/** Sign up (App Flow §4.1): the form, with date of birth and invite code, arrives with task 3.4. */
export default function SignUp() {
  const { t } = useTranslation();
  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton />
      <Placeholder title={t('auth.signUpTitle')} note={t('auth.comingSoon')} />
    </Screen>
  );
}
