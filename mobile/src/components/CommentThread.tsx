// The replies under one comment (BR-FD-08). Collapsed to a "View N replies" line, because a long
// thread would otherwise push every other comment off the screen; opening it loads the thread,
// oldest first, and pages as it is scrolled.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { type Comment, type Reply, useReplies } from '@/api/comments';
import { errorMessage } from '@/api/errors';
import { formatCount } from '@/i18n/format';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

/** How far a reply is indented from its parent comment. */
export const REPLY_INDENT = 42;

export function CommentThread({ comment, renderReply }: {
  comment: Comment;
  renderReply: (reply: Reply, parentId: string) => React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { colors, space } = useTheme();
  const [open, setOpen] = useState(false);
  const replies = useReplies(comment.id, open);

  const loaded = replies.data?.pages.flatMap((page) => page.items) ?? [];
  // The count is the server's stored one, which does not know the viewer's blocks, so once the
  // thread is open the rows actually loaded are the better number to show.
  const count = open && replies.isSuccess ? loaded.length : comment.replyCount;
  if (count === 0 && !open) return null;

  return (
    <View style={{ paddingLeft: REPLY_INDENT, gap: space.xxs }}>
      {open ? loaded.map((reply) => <View key={reply.id}>{renderReply(reply, comment.id)}</View>) : null}

      {open && replies.isError && loaded.length === 0 ? (
        <Text variant="caption" color={colors.danger}>{errorMessage(replies.error, t)}</Text>
      ) : null}

      {open && replies.isPending ? <ActivityIndicator color={colors.textMuted} style={styles.spinner} /> : null}

      <Pressable
        onPress={() => (open && !replies.hasNextPage ? setOpen(false) : open ? void replies.fetchNextPage() : setOpen(true))}
        accessibilityRole="button" hitSlop={6} style={styles.toggle}>
        <Text variant="caption" muted>
          {open && replies.hasNextPage ? t('comments.moreReplies')
            : open ? t('comments.hideReplies')
            : t('comments.viewReplies', { count, formatted: formatCount(count, i18n.language) })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { paddingVertical: 6 },
  spinner: { alignSelf: 'flex-start', paddingVertical: 6 },
});
