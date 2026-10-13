// The ⋯ menu on a post (App Flow §5, §7.3, §7.4, §10), a bottom sheet. Your own post → Copy link,
// Delete (confirm, then gone from the feed and grids, toast "Post deleted"); someone else's →
// Report, Copy link, "Unfollow @x?" when you follow them, Block @x.
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { errorMessage } from '@/api/errors';
import { type Post, useDeletePost } from '@/api/posts';
import { type SheetAction, showActions } from '@/components/Sheet';
import { showToast } from '@/components/Toast';
import { copyLink } from '@/engagement/share';
import { useFollowToggle } from '@/people/follow';
import { confirmBlock } from '@/safety/block';
import { openReport } from '@/safety/report';

export function usePostMenu({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation();
  const remove = useDeletePost();
  const toggleFollow = useFollowToggle(t);

  const confirmDelete = (post: Post) => Alert.alert(t('feed.deleteTitle'), t('feed.deleteBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('feed.delete'), style: 'destructive',
      onPress: () => remove.mutate(post.id, {
        onSuccess: () => { showToast(t('feed.deleted')); onDeleted?.(); },
        onError: (error) => Alert.alert(t('feed.deleteFailed'), errorMessage(error, t)),
      }),
    },
  ]);

  /** `following`: whether the user follows the author (offers Unfollow). */
  return (post: Post, following: boolean) => {
    const copy: SheetAction = { label: t('share.copyLink'), onPress: () => void copyLink(post.shareUrl, t) };
    const actions: SheetAction[] = post.isMine
      ? [copy, { label: t('feed.delete'), destructive: true, onPress: () => confirmDelete(post) }]
      : [
        { label: t('safety.report'), destructive: true, onPress: () => openReport({ type: 'POST', id: post.id, user: post.author }) },
        copy,
        ...(following ? [{ label: t('people.unfollow'), onPress: () => toggleFollow(post.author, true) }] : []),
        { label: t('safety.blockUser', { username: post.author.username }), destructive: true, onPress: () => confirmBlock(post.author) },
      ];
    showActions(actions, { cancel: t('common.cancel') });
  };
}
