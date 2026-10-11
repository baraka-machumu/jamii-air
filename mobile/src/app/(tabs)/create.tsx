import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';

export default function CreateTab() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Placeholder title={t('tabs.create')} note={t('placeholder.create')} />
    </Screen>
  );
}
