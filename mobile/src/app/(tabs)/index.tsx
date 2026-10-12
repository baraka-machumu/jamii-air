import { useTranslation } from 'react-i18next';
import { Placeholder } from '@/components/Placeholder';
import { PostingCard } from '@/components/PostingCard';
import { Screen } from '@/components/Screen';

export default function HomeTab() {
  const { t } = useTranslation();
  return (
    <Screen>
      {/* The post being shared, above the feed (App Flow §6). */}
      <PostingCard />
      <Placeholder title={t('tabs.home')} note={t('placeholder.home')} />
    </Screen>
  );
}
