// The Jamii Air mark: a circle of people-dots forming an air bubble (approved designs).
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { displayFont } from '@/theme/tokens';
import { Text } from './Text';

const DOTS: [number, number][] = [[24, 9], [34.6, 13.4], [39, 24], [34.6, 34.6], [24, 39], [13.4, 34.6], [9, 24], [13.4, 13.4]];

export function LogoMark({ size = 28, accent, ink }: { size?: number; accent: string; ink: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
      {DOTS.map(([cx, cy], i) => <Circle key={i} cx={cx} cy={cy} r={3.6} fill={i % 2 === 0 ? accent : ink} />)}
    </Svg>
  );
}

export function Wordmark({ size = 22, accent, ink }: { size?: number; accent: string; ink: string }) {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="Jamii Air">
      <LogoMark size={size + 6} accent={accent} ink={ink} />
      <Text style={{ fontFamily: displayFont, fontSize: size, lineHeight: size * 1.2, color: ink }}>jamii air</Text>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 } });
