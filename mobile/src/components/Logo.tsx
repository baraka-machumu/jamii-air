// The Kidili mark: a purple speech bubble with a white K in three strokes (Design Brief §15.2).
// scripts/make-icons.py draws the app icons from the same 40-unit grid.
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { maxFontScale, wordmarkFont } from '@/theme/tokens';
import { Text } from './Text';

const BUBBLE = 'M8 3h24a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H19l-8 6v-6H8a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z';
const K = 'M15 10.5v15M15 19l9-8.5M18.2 16 25 25.5';

export function LogoMark({ size = 34, bubble, ink }: { size?: number; bubble: string; ink: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      <Path d={BUBBLE} fill={bubble} />
      <Path d={K} stroke={ink} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Mark and KIDILI wordmark; `color` is the theme's `brand`, `ink` the K (`onBrand`). */
export function Wordmark({ size = 28, color, ink }: { size?: number; color: string; ink: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={t('brand.name')}>
      <LogoMark size={size + 6} bubble={color} ink={ink} />
      <Text maxFontSizeMultiplier={maxFontScale.compact}
        style={{ fontFamily: wordmarkFont, fontSize: size, lineHeight: size * 1.15, letterSpacing: 0.5, color }}>KIDILI</Text>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 } });
