// The upload-progress card (Design Brief §6 Feedback; App Flow §6): "Posting… 45%" → "Processing…"
// → gone when published, or "Couldn't post" with the reason, Retry and Discard. The thumbnail is
// the post's first photo, or the video's own frame; the percentage covers every file in the post,
// so a ten-photo carousel fills one bar rather than ten (BR-CT-09).
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { discardPosting, retryPosting } from '@/posting/run';
import { usePosting } from '@/posting/store';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export function PostingCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { colors, radius, space } = useTheme();
  const draft = usePosting((s) => s.draft);
  const progress = usePosting((s) => s.progress);
  if (!draft || draft.phase === 'editing') return null;
  const thumbUri = draft.video?.uri ?? draft.photos[0]?.image?.uri ?? draft.photos[0]?.source.uri;
  if (!thumbUri) return null;

  const failed = draft.phase === 'failed';
  const label = failed ? t('create.failed')
    : draft.phase === 'uploading' ? t('create.posting', { percent: Math.round(progress * 100) })
    : draft.phase === 'creating' ? t('create.postingShort')
    : t('create.processing');
  const reason = failed && draft.failure
    ? t(`create.failures.${draft.failure}`, { defaultValue: t(`errors.${draft.failure}`, { defaultValue: t('errors.UNKNOWN') }) })
    : undefined;

  return (
    <View accessibilityLiveRegion="polite" style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.sm, gap: space.sm }]}>
      <View style={styles.row}>
        <Image source={{ uri: thumbUri }} style={[styles.thumb, { borderRadius: radius.sm / 2 }]} accessibilityIgnoresInvertColors />
        <View style={styles.flex}>
          <Text variant="bodyStrong" color={failed ? colors.danger : undefined}>{label}</Text>
          {reason ? <Text variant="caption" muted>{reason}</Text> : null}
          {draft.phase === 'uploading' && (
            <View style={[styles.track, { backgroundColor: colors.border }]} accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
              <View style={[styles.bar, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary }]} />
            </View>
          )}
        </View>
      </View>
      {failed && (
        <View style={styles.actions}>
          <Button kind="secondary" label={t('create.discard')} onPress={discardPosting} style={styles.action} />
          <Button label={t('common.retry')} onPress={() => void retryPosting(queryClient)} style={styles.action} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 4 },
  thumb: { width: 48, height: 48 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  bar: { height: 4 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  action: { minHeight: 40, paddingHorizontal: 16 },
});
