// The waiting indicator (task 3.12.c). A bare ActivityIndicator is invisible to a screen reader:
// the screen falls silent while it loads. This one announces itself, so it is used wherever the
// spinner *is* the screen (or the whole list). Paging footers keep a plain ActivityIndicator:
// content is already on screen and an announcement on every page would talk over the reading.
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function Spinner({ style, color }: { style?: ViewStyle; color?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <ActivityIndicator
      // Without `accessible` the indicator is not an element the reader stops on, and the label
      // and role below are never read out.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      color={color ?? colors.textMuted}
      style={style}
    />
  );
}
