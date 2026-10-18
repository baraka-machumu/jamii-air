// Comments (App Flow §7.2; BR-FD-04, 05, 08, 09). The post's caption is pinned at the top; the list runs
// **newest first**, so a comment you have just written is the one you see, at the top, instead of
// landing out of sight at the end of a long thread. Older pages load on scrolling down, which is
// how the API pages anyway. The input bar stays above the keyboard (on Android by the reported keyboard height: src/components/keyboard.ts). Send: the
// comment shows at once as "Sending…", then is confirmed; a failure turns it into "Not sent · Tap
// to retry" (same Idempotency-Key, so a retry never posts twice). Long-press a comment → a sheet:
// Report (someone else's comment, §10.2) and Delete → confirm (yours, or any on your post). Max
// 1,000 characters, counter from 900. A post you can no longer see (deleted, or a block) hides the
// input.
//
// Replies (BR-FD-08) hang under their comment, collapsed behind "View N replies" and indented.
// Reply puts the input into "Replying to <username>" until it is sent or cancelled. Replies are
// one level deep, so a reply's own Reply answers the same parent (BR-FD-09) — which is what the
// server does with it anyway.
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  addComment, type Comment, COMMENT_COUNTER_FROM, deleteComment, MAX_COMMENT, newCommentKey,
  type Reply, useComments,
} from '@/api/comments';
import { ApiError, errorMessage } from '@/api/errors';
import { type Me, meKey } from '@/api/me';
import { usePost } from '@/api/posts';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Caption } from '@/components/Caption';
import { CommentThread, REPLY_INDENT } from '@/components/CommentThread';
import { Header } from '@/components/Header';
import { useAndroidKeyboardHeight } from '@/components/keyboard';
import { Screen } from '@/components/Screen';
import { type SheetAction, showActions } from '@/components/Sheet';
import { Spinner } from '@/components/Spinner';
import { Text } from '@/components/Text';
import { showToast } from '@/components/Toast';
import { formatRelative } from '@/i18n/time';
import { openReport } from '@/safety/report';
import { useSession } from '@/stores/session';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';

/** A comment typed here that the server has not confirmed yet. */
interface Pending { key: string; body: string; state: 'sending' | 'failed'; createdAt: string; parentId?: string }

type Row = { kind: 'comment'; comment: Comment } | { kind: 'pending'; pending: Pending };

/** Which comment the input is answering, if any. */
interface ReplyTo { id: string; username: string }

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
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const input = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const keyboard = useAndroidKeyboardHeight();

  const gone = (error: unknown) => error instanceof ApiError && error.status === 404;
  const cannotComment = closed || gone(post.error) || gone(comments.error);

  const send = async (item: Pending) => {
    setPending((list) => [...list.filter((p) => p.key !== item.key), { ...item, state: 'sending' }]);
    const me = queryClient.getQueryData<Me>(meKey);
    const author = { id: user?.id ?? '', username: me?.username ?? user?.username ?? '', displayName: me?.displayName ?? null, avatarUrl: me?.avatarUrl ?? null };
    try {
      await addComment(queryClient, id, item.body, item.key, author, item.parentId);
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
    const parentId = replyTo?.id;
    setDraft('');
    setReplyTo(null);
    void send({ key: newCommentKey(), body, state: 'sending', createdAt: new Date().toISOString(), parentId });
    // A new comment goes in at the top; if the list was scrolled down, go and look at it. A reply
    // lands inside its own thread, which the user is already looking at, so the list stays put.
    if (!parentId) listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const startReply = (target: ReplyTo) => {
    setReplyTo(target);
    input.current?.focus();
  };

  const remove = (comment: Comment | Reply, parentId?: string) => {
    // Only warn about the thread when there is one to lose: deleting a top-level comment takes
    // its replies with it (BR-FD-08).
    const alsoReplies = !parentId && 'replyCount' in comment && comment.replyCount > 0;
    Alert.alert(alsoReplies ? t('comments.deleteThreadTitle') : t('comments.deleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('feed.delete'), style: 'destructive',
        onPress: () => void deleteComment(queryClient, id, comment.id, parentId)
          .then(() => showToast(t('comments.deleted')))
          .catch((error: unknown) => Alert.alert(t('comments.deleteFailed'), errorMessage(error, t))),
      },
    ]);
  };

  const mine = (comment: Comment | Reply) => comment.author.id === user?.id;
  const options = (comment: Comment | Reply, parentId?: string) => {
    const actions: SheetAction[] = [];
    if (!mine(comment)) actions.push({ label: t('safety.report'), destructive: true, onPress: () => openReport({ type: 'COMMENT', id: comment.id, user: comment.author }) });
    if (comment.canDelete) actions.push({ label: t('feed.delete'), destructive: true, onPress: () => remove(comment, parentId) });
    showActions(actions, { cancel: t('common.cancel') });
  };

  // Newest first, top to bottom: unsent ones (latest typed first), then the server's pages.
  const rows: Row[] = [
    // Only unsent top-level comments belong here; an unsent reply is drawn inside its own thread.
    ...[...pending].filter((p) => !p.parentId).reverse().map((p): Row => ({ kind: 'pending', pending: p })),
    ...(comments.data?.pages.flatMap((page) => page.items) ?? []).map((c): Row => ({ kind: 'comment', comment: c })),
  ];

  let list;
  if (gone(post.error) || (gone(comments.error) && !post.data)) {
    list = <View style={styles.center}><Text muted style={styles.textCenter}>{t('errors.POST_NOT_FOUND')}</Text></View>;
  } else if (comments.isPending) {
    list = <Spinner style={styles.center} />;
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
        testID="comments"
        ref={listRef}
        data={rows}
        keyExtractor={(row) => (row.kind === 'comment' ? row.comment.id : row.pending.key)}
        renderItem={({ item }) => (item.kind === 'comment'
          ? (
            <View>
              <CommentRow comment={item.comment}
                onLongPress={item.comment.canDelete || !mine(item.comment) ? () => options(item.comment) : undefined}
                onReply={() => startReply({ id: item.comment.id, username: item.comment.author.username })} />
              <CommentThread comment={item.comment} renderReply={(reply, parentId) => (
                <CommentRow comment={reply}
                  onLongPress={reply.canDelete || !mine(reply) ? () => options(reply, parentId) : undefined}
                  // One level only: replying from a reply answers the comment above it (BR-FD-09).
                  onReply={() => startReply({ id: parentId, username: reply.author.username })} />
              )} />
              {pending.filter((p) => p.parentId === item.comment.id).map((p) => (
                <View key={p.key} style={{ paddingLeft: REPLY_INDENT }}>
                  <PendingRow pending={p} onRetry={() => void send(p)} />
                </View>
              ))}
            </View>
          )
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
              <Caption caption={caption.caption!} username={caption.author.username} />
              <Text variant="caption" muted>{formatRelative(caption.createdAt, i18n.language)}</Text>
            </View>
          </View>
        )}
        <View style={styles.fill}>{list}</View>

        {replyTo && !cannotComment ? (
          <View style={[styles.replyBar, { borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.md }]}>
            <Text variant="caption" muted style={styles.fill}>{t('comments.replyingTo', { username: replyTo.username })}</Text>
            <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button" hitSlop={8}
              accessibilityLabel={t('comments.cancelReply')}>
              <Text variant="caption" color={colors.primary}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.inputBar, { borderColor: colors.border, paddingHorizontal: space.md }]}>
          {cannotComment ? (
            <Text muted style={[styles.textCenter, styles.fill, { paddingVertical: space.sm }]}>{t('comments.cannotComment')}</Text>
          ) : (
            <>
              <View style={styles.fill}>
                <TextInput
                  ref={input}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={replyTo ? t('comments.replyPlaceholder', { username: replyTo.username }) : t('comments.placeholder')}
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel={replyTo ? t('comments.replyPlaceholder', { username: replyTo.username }) : t('comments.placeholder')}
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

const CommentRow = memo(function CommentRow({ comment, onLongPress, onReply }: {
  comment: Comment | Reply;
  onLongPress?: () => void;
  onReply?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { space } = useTheme();
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350}
      accessibilityActions={onLongPress ? [{ name: 'longpress' }] : undefined}
      onAccessibilityAction={onLongPress}
      style={[styles.row, { paddingHorizontal: space.md }]}>
      <Avatar uri={comment.author.avatarUrl} name={comment.author.displayName || comment.author.username} size={32} />
      <View style={styles.fill}>
        {/* A comment's own hashtags are tappable too, like a caption's (BR-FD-10). */}
        <Caption caption={comment.body} username={comment.author.username} />
        <View style={styles.meta}>
          <Text variant="caption" muted>{formatRelative(comment.createdAt, i18n.language)}</Text>
          {onReply ? (
            <Pressable onPress={onReply} accessibilityRole="button" hitSlop={6}>
              <Text variant="caption" muted>{t('comments.reply')}</Text>
            </Pressable>
          ) : null}
        </View>
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
  meta: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pinned: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  input: { minHeight: 40, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  counter: { alignSelf: 'flex-end', marginTop: 2, marginRight: 4 },
  send: { minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center', alignItems: 'center' },
});
