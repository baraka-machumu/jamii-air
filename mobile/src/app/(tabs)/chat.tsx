// Chat (App Flow §16.7): built in stage K5. Until then the tab says it is coming.
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '@/components/ComingSoon';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';

export default function ChatTab() {
  const { t } = useTranslation();
  const { space } = useTheme();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header" style={{ fontSize: 22, paddingVertical: space.sm }}>{t('tabs.chat')}</Text>
      <ComingSoon icon="comment" body={t('soon.chat')} />
    </Screen>
  );
}
