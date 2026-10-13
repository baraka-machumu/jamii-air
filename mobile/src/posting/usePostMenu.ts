// The ⋯ menu on a post (App Flow §5, §7.3, §7.4). Your own post → Copy link, Delete (confirm, then
// gone from the feed and grids, toast "Post deleted"); someone else's → Copy link, and "Unfollow
// @x?" when you follow them. Report and Block join it with task 3.11 (with a bottom sheet then:
// Android dialogs hold three buttons).
import { useTranslation } from 'react-i18next';
import { Alert, type AlertButton } from 'react-native';
import { errorMessage } from '@/api/errors';
import { type Post, useDeletePost } from '@/api/posts';
import { showToast } from '@/components/Toast';
import { copyLink } from '@/engagement/share';
import { useFollowToggle } from '@/people/follow';

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
    const actions: AlertButton[] = [{ text: t('share.copyLink'), onPress: () => void copyLink(post.shareUrl, t) }];
    if (post.isMine) actions.push({ text: t('feed.delete'), style: 'destructive', onPress: () => confirmDelete(post) });
    else if (following) actions.push({ text: t('people.unfollow'), style: 'destructive', onPress: () => toggleFollow(post.author, true) });
    Alert.alert(t('feed.moreOptions'), undefined, [...actions, { text: t('common.cancel'), style: 'cancel' }]);
  };
}
