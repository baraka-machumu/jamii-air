// Date of birth (App Flow §4.1): the native date picker, a dialog on Android and a spinner under
// the field on iOS. The web preview (development only) has no native picker: type YYYY-MM-DD.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { parseIsoDate, toIsoDate } from '@/auth/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { TextField } from './TextField';

export interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  /** Where the picker opens when nothing is picked yet. */
  initial: Date;
  maximumDate: Date;
  error?: string;
  helper?: string;
}

export function DateField(props: DateFieldProps) {
  return Platform.OS === 'web' ? <TypedDate {...props} /> : <PickedDate {...props} />;
}

function PickedDate({ label, value, onChange, initial, maximumDate, error, helper }: DateFieldProps) {
  const { i18n } = useTranslation();
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = value?.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  const show = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: value ?? initial, mode: 'date', maximumDate,
        onValueChange: (_event, date) => { if (date) onChange(date); },
      });
    } else {
      setOpen((o) => !o);
    }
  };

  return (
    <View style={styles.root}>
      <Text variant="caption" muted>{label}</Text>
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={label}
        accessibilityValue={shown ? { text: shown } : undefined} accessibilityHint={error ?? helper}
        style={[styles.box, { backgroundColor: colors.surface, borderRadius: radius.sm, borderColor: error ? colors.danger : colors.border }]}>
        <Text muted={!shown}>{shown ?? 'DD / MM / YYYY'}</Text>
      </Pressable>
      {open && Platform.OS === 'ios' && (
        <DateTimePicker value={value ?? initial} mode="date" display="spinner" maximumDate={maximumDate}
          onValueChange={(_event, date) => { if (date) onChange(date); }} />
      )}
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text variant="caption" muted>{helper}</Text>
      ) : null}
    </View>
  );
}

function TypedDate({ label, value, onChange, error, helper }: DateFieldProps) {
  const [text, setText] = useState(value ? toIsoDate(value) : '');
  return (
    <TextField label={label} value={text} placeholder="YYYY-MM-DD" error={error} helper={helper}
      onChangeText={(next) => {
        setText(next);
        const date = parseIsoDate(next);
        if (date) onChange(date);
      }} />
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  box: { minHeight: 52, borderWidth: 1.5, paddingHorizontal: 14, justifyContent: 'center' },
});
