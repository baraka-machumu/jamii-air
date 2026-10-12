// The ⋯ menu on a post (App Flow §5, §7.4). Built so far: your own post → Delete (confirm, then
// gone from the feed and grids, toast "Post deleted"); someone else's → "Unfollow @x?" when you
// follow them (PostCard hides ⋯ otherwise). Copy link (3.9), Report and Block (3.11) join it later.
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { errorMessage } from '@/api/errors';
import { type Post, useDeletePost } from '@/api/posts';
import { showToast } from '@/components/Toast';
import { useFollowToggle } from '@/people/follow';

export function usePostMenu({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation();
  const remove = useDeletePost();
  const toggleFollow = useFollowToggle(t);

  return (post: Post) => {
    if (post.isMine) {
      Alert.alert(t('feed.deleteTitle'), t('feed.deleteBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('feed.delete'), style: 'destructive',
          onPress: () => remove.mutate(post.id, {
            onSuccess: () => { showToast(t('feed.deleted')); onDeleted?.(); },
            onError: (error) => Alert.alert(t('feed.deleteFailed'), errorMessage(error, t)),
          }),
        },
      ]);
      return;
    }
    // Someone else's post: for now the only action is Unfollow, so its confirm sheet is the menu.
    toggleFollow(post.author, true);
  };
}
