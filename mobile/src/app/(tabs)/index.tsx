import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';

export default function HomeTab() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Placeholder title={t('tabs.home')} note={t('placeholder.home')} />
    </Screen>
  );
}
