// Comments (App Flow §7.2; BR-FD-04, 05). The post's caption is pinned at the top; the list runs
// oldest → newest with the newest at the bottom (an inverted list: the API's newest-first pages
// fit it as they come, and older pages load on scrolling up). The input bar stays above the
// keyboard (on Android by the reported keyboard height: src/components/keyboard.ts). Send: the
// comment shows at once as "Sending…", then is confirmed; a failure turns it into "Not sent · Tap
// to retry" (same Idempotency-Key, so a retry never posts twice). Long-press a comment → a sheet:
// Report (someone else's comment, §10.2) and Delete → confirm (yours, or any on your post). Max
// 1,000 characters, counter from 900. A post you can no longer see (deleted, or a block) hides the
// input.
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  addComment, type Comment, COMMENT_COUNTER_FROM, deleteComment, MAX_COMMENT, newCommentKey, useComments,
} from '@/api/comments';
import { ApiError, errorMessage } from '@/api/errors';
import { type Me, meKey } from '@/api/me';
import { usePost } from '@/api/posts';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { useAndroidKeyboardHeight } from '@/components/keyboard';
import { Screen } from '@/components/Screen';
import { type SheetAction, showActions } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { showToast } from '@/components/Toast';
import { formatRelative } from '@/i18n/time';
import { openReport } from '@/safety/report';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

/** A comment typed here that the server has not confirmed yet. */
interface Pending { key: string; body: string; state: 'sending' | 'failed'; createdAt: string }

type Row = { kind: 'comment'; comment: Comment } | { kind: 'pending'; pending: Pending };

export default function Comments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors, space } = useTheme();
  const queryClient = useQueryClient();
  const user = useSession((s) => s.user);
  const post = usePost(id);
  const comments = useComments(id);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [closed, setClosed] = useState(false);
  const keyboard = useAndroidKeyboardHeight();

  const gone = (error: unknown) => error instanceof ApiError && error.status === 404;
  const cannotComment = closed || gone(post.error) || gone(comments.error);

  const send = async (item: Pending) => {
    setPending((list) => [...list.filter((p) => p.key !== item.key), { ...item, state: 'sending' }]);
    const me = queryClient.getQueryData<Me>(meKey);
    const author = { id: user?.id ?? '', username: me?.username ?? user?.username ?? '', displayName: me?.displayName ?? null, avatarUrl: me?.avatarUrl ?? null };
    try {
      await addComment(queryClient, id, item.body, item.key, author);
      setPending((list) => list.filter((p) => p.key !== item.key));
    } catch (error) {
      if (gone(error)) {
        setPending((list) => list.filter((p) => p.key !== item.key));
        setClosed(true);
        return;
      }
      setPending((list) => list.map((p) => (p.key === item.key ? { ...p, state: 'failed' } : p)));
      if (!(error instanceof ApiError && error.isNetwork)) showToast(errorMessage(error, t));
    }
  };

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    void send({ key: newCommentKey(), body, state: 'sending', createdAt: new Date().toISOString() });
  };

  const remove = (comment: Comment) => {
    Alert.alert(t('comments.deleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('feed.delete'), style: 'destructive',
        onPress: () => void deleteComment(queryClient, id, comment.id)
          .then(() => showToast(t('comments.deleted')))
          .catch((error: unknown) => Alert.alert(t('comments.deleteFailed'), errorMessage(error, t))),
      },
    ]);
  };

  const mine = (comment: Comment) => comment.author.id === user?.id;
  const options = (comment: Comment) => {
    const actions: SheetAction[] = [];
    if (!mine(comment)) actions.push({ label: t('safety.report'), destructive: true, onPress: () => openReport({ type: 'COMMENT', id: comment.id, user: comment.author }) });
    if (comment.canDelete) actions.push({ label: t('feed.delete'), destructive: true, onPress: () => remove(comment) });
    showActions(actions, { cancel: t('common.cancel') });
  };

  // Inverted list: index 0 sits at the bottom. Newest first: unsent ones (latest typed first), then the server's.
  const rows: Row[] = [
    ...[...pending].reverse().map((p): Row => ({ kind: 'pending', pending: p })),
    ...(comments.data?.pages.flatMap((page) => page.items) ?? []).map((c): Row => ({ kind: 'comment', comment: c })),
  ];

  let list;
  if (gone(post.error) || (gone(comments.error) && !post.data)) {
    list = <View style={styles.center}><Text muted style={styles.textCenter}>{t('errors.POST_NOT_FOUND')}</Text></View>;
  } else if (comments.isPending) {
    list = <ActivityIndicator style={styles.center} color={colors.textMuted} />;
  } else if (comments.isError && rows.length === 0) {
    list = (
      <View style={[styles.center, { padding: space.md }]}>
        <Text muted style={styles.textCenter}>{errorMessage(comments.error, t)}</Text>
        <Button kind="secondary" label={t('common.retry')} onPress={() => void comments.refetch()} />
      </View>
    );
  } else if (rows.length === 0) {
    list = (
      <View style={[styles.center, { padding: space.md }]}>
        <Text variant="bodyStrong" style={styles.textCenter}>{t('comments.emptyTitle')}</Text>
        <Text muted style={styles.textCenter}>{t('comments.emptyBody')}</Text>
      </View>
    );
  } else {
    list = (
      <FlatList
        inverted
        data={rows}
        keyExtractor={(row) => (row.kind === 'comment' ? row.comment.id : row.pending.key)}
        renderItem={({ item }) => (item.kind === 'comment'
          ? <CommentRow comment={item.comment} onLongPress={item.comment.canDelete || !mine(item.comment) ? options : undefined} />
          : <PendingRow pending={item.pending} onRetry={() => void send(item.pending)} />)}
        onEndReached={() => { if (comments.hasNextPage && !comments.isFetchingNextPage) void comments.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={comments.isFetchingNextPage ? <ActivityIndicator style={{ padding: space.md }} color={colors.textMuted} /> : null}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: space.sm }}
      />
    );
  }

  const caption = post.data?.caption ? post.data : undefined;
  const length = draft.length;

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={[styles.fill, { paddingBottom: keyboard }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: space.md }}><Header title={t('comments.title')} /></View>
        {caption && (
          <View style={[styles.row, styles.pinned, { paddingHorizontal: space.md, borderColor: colors.border }]}>
            <Avatar uri={caption.author.avatarUrl} name={caption.author.displayName || caption.author.username} size={32} />
            <View style={styles.fill}>
              <Text><Text variant="bodyStrong">{caption.author.username} </Text>{caption.caption}</Text>
              <Text variant="caption" muted>{formatRelative(caption.createdAt, i18n.language)}</Text>
            </View>
          </View>
        )}
        <View style={styles.fill}>{list}</View>

        <View style={[styles.inputBar, { borderColor: colors.border, paddingHorizontal: space.md }]}>
          {cannotComment ? (
            <Text muted style={[styles.textCenter, styles.fill, { paddingVertical: space.sm }]}>{t('comments.cannotComment')}</Text>
          ) : (
            <>
              <View style={styles.fill}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('comments.placeholder')}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={t('comments.placeholder')}
                  multiline
                  maxLength={MAX_COMMENT}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.surface }]}
                />
                {length >= COMMENT_COUNTER_FROM && (
                  <Text variant="caption" color={length >= MAX_COMMENT ? colors.danger : colors.textMuted} style={styles.counter}
                    accessibilityLiveRegion="polite">
                    {t('comments.counter', { length, max: MAX_COMMENT })}
                  </Text>
                )}
              </View>
              <Pressable onPress={submit} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel={t('comments.send')}
                accessibilityState={{ disabled: !draft.trim() }} style={styles.send}>
                <Text variant="button" color={draft.trim() ? colors.primary : colors.textMuted}>{t('comments.send')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const CommentRow = memo(function CommentRow({ comment, onLongPress }: { comment: Comment; onLongPress?: (comment: Comment) => void }) {
  const { i18n } = useTranslation();
  const { space } = useTheme();
  return (
    <Pressable onLongPress={onLongPress ? () => onLongPress(comment) : undefined} delayLongPress={350}
      accessibilityActions={onLongPress ? [{ name: 'longpress' }] : undefined}
      onAccessibilityAction={onLongPress ? () => onLongPress(comment) : undefined}
      style={[styles.row, { paddingHorizontal: space.md }]}>
      <Avatar uri={comment.author.avatarUrl} name={comment.author.displayName || comment.author.username} size={32} />
      <View style={styles.fill}>
        <Text><Text variant="bodyStrong">{comment.author.username} </Text>{comment.body}</Text>
        <Text variant="caption" muted>{formatRelative(comment.createdAt, i18n.language)}</Text>
      </View>
    </Pressable>
  );
});

function PendingRow({ pending, onRetry }: { pending: Pending; onRetry: () => void }) {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const user = useSession((s) => s.user);
  const failed = pending.state === 'failed';
  return (
    <Pressable onPress={failed ? onRetry : undefined} disabled={!failed} accessibilityRole={failed ? 'button' : undefined}
      style={[styles.row, { paddingHorizontal: space.md, opacity: failed ? 1 : 0.6 }]}>
      <Avatar name={user?.username ?? ''} size={32} />
      <View style={styles.fill}>
        <Text><Text variant="bodyStrong">{user?.username} </Text>{pending.body}</Text>
        <Text variant="caption" color={failed ? colors.danger : colors.textMuted}>
          {failed ? t('comments.notSent') : t('comments.sending')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', gap: 12 },
  textCenter: { textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  pinned: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  input: { minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  counter: { alignSelf: 'flex-end', marginTop: 2, marginRight: 4 },
  send: { minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center', alignItems: 'center' },
});
