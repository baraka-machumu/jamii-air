import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon } from './Icon';

export function BackButton({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress ?? (() => router.back())} accessibilityRole="button" accessibilityLabel={t('common.back')}
      hitSlop={8} style={{ width: touchTarget, height: touchTarget, justifyContent: 'center', marginLeft: -10 }}>
      <Icon name="back" color={colors.text} />
    </Pressable>
  );
}
