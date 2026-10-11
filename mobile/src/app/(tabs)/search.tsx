import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';

export default function SearchTab() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Placeholder title={t('tabs.search')} note={t('placeholder.search')} />
    </Screen>
  );
}
