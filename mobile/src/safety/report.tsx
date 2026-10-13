// Report (App Flow §10.2; BR-SF-02): ⋯ → Report → a reason (and optional details, ≤ 1,000) →
// Submit → POST /reports → "Thanks — we'll review this." with an offer to block the account.
// Posts, comments and accounts are reported the same way. A repeat report is accepted silently;
// admins handle reports in the admin portal (§10.3), the reporter hears nothing more in R1.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { errorMessage } from '@/api/errors';
import { MAX_REPORT_DETAILS, REPORT_REASONS, type ReportReason, type ReportTargetType, sendReport } from '@/api/safety';
import { Button } from '@/components/Button';
import { closeSheet, openSheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { type BlockTarget, confirmBlock } from './block';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** The account behind it: the one offered for blocking afterwards. */
  user: BlockTarget;
  /** Already blocked: no Block offer after the report. */
  blocked?: boolean;
}

/** The counter shows from here (as for comments). */
const COUNTER_FROM = 900;

export function openReport(target: ReportTarget): void {
  openSheet(<ReportSheet target={target} />);
}

function ReportSheet({ target }: { target: ReportTarget }) {
  const { t } = useTranslation();
  const { colors, radius, space } = useTheme();
  const [reason, setReason] = useState<ReportReason>();
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(undefined);
    try {
      await sendReport({ targetType: target.type, targetId: target.id, reason, ...(details.trim() && { details: details.trim() }) });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <View accessibilityViewIsModal style={{ gap: space.sm, paddingVertical: space.xs }}>
        <Text variant="title" accessibilityRole="header" accessibilityLiveRegion="polite">{t('safety.reportThanks')}</Text>
        <Text muted>{t('safety.reportThanksBody')}</Text>
        {!target.blocked && (
          <Button kind="secondary" label={t('safety.blockUser', { username: target.user.username })} onPress={() => confirmBlock(target.user)} />
        )}
        <Button label={t('safety.done')} onPress={closeSheet} />
      </View>
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" accessibilityViewIsModal contentContainerStyle={{ paddingVertical: space.xs }}>
      <Text variant="title" accessibilityRole="header">{t(`safety.reportTitle.${target.type}`)}</Text>
      <Text muted style={{ marginTop: space.xxs, marginBottom: space.xs }}>{t('safety.reportSubtitle')}</Text>
      <View accessibilityRole="radiogroup">
        {REPORT_REASONS.map((value) => {
          const on = reason === value;
          return (
            <Pressable key={value} onPress={() => setReason(value)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={[styles.reason, { borderBottomColor: colors.border }]}>
              <Text style={styles.fill}>{t(`safety.reasons.${value}`)}</Text>
              <View style={[styles.radio, { borderColor: on ? colors.primary : colors.textMuted }]}>
                {on && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <TextInput value={details} onChangeText={setDetails} maxLength={MAX_REPORT_DETAILS} multiline
        placeholder={t('safety.detailsPlaceholder')} placeholderTextColor={colors.textMuted} accessibilityLabel={t('safety.detailsPlaceholder')}
        style={[styles.details, { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.sm, marginTop: space.sm }]} />
      {details.length >= COUNTER_FROM && (
        <Text variant="caption" muted style={styles.counter}>{t('comments.counter', { length: details.length, max: MAX_REPORT_DETAILS })}</Text>
      )}
      {error ? <Text color={colors.danger} accessibilityRole="alert" style={{ marginTop: space.xs }}>{error}</Text> : null}
      <View style={{ gap: space.xs, marginTop: space.sm }}>
        <Button label={t('safety.submit')} onPress={() => void submit()} disabled={!reason} loading={busy} />
        <Button kind="tertiary" label={t('common.cancel')} onPress={closeSheet} disabled={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  reason: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget + 4, borderBottomWidth: StyleSheet.hairlineWidth },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  details: { minHeight: 72, maxHeight: 140, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', marginTop: 2 },
});
