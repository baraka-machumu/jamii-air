import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** Pill switch for 2–3 options (Settings: language, theme; approved design). */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, { backgroundColor: colors.surface }]}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio"
              accessibilityState={{ checked: on }} style={[styles.option, on && { backgroundColor: colors.bg }]}>
              <Text variant="button" color={on ? colors.text : colors.textMuted} style={styles.optionText}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  track: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  option: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  optionText: { fontSize: 14, textAlign: 'center' },
});
