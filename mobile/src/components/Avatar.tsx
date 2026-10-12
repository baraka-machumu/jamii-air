import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** Round avatar (Design Brief §6); without a photo, the first letter on the brand indigo. */
export function Avatar({ uri, name, size = 88 }: { uri?: string | null; name: string; size?: number }) {
  const { colors } = useTheme();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[round, { backgroundColor: colors.surface }]} contentFit="cover" transition={150}
      accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[round, styles.initial, { backgroundColor: colors.brandDeep }]}>
      <Text color="#FFFFFF" style={{ fontSize: size * 0.4, lineHeight: size * 0.5, fontWeight: '600' }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ initial: { alignItems: 'center', justifyContent: 'center' } });
