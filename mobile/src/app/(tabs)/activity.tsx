import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';

export default function ActivityTab() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Placeholder title={t('tabs.activity')} note={t('placeholder.activity')} />
    </Screen>
  );
}
