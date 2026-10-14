import { useTranslation } from 'react-i18next';
import { useFollowToggle, useIsFollowing } from '@/people/follow';
import { Button } from './Button';

/**
 * Follow / Following (App Flow §8.2): flips at once; Following → "Unfollow @x?" first.
 * Someone who follows you and you don't follow yet gets "Follow back" (§9).
 */
export function FollowButton({ user, following: fromServer, followsMe, compact }: {
  user: { id: string; username: string };
  following: boolean;
  followsMe?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const toggle = useFollowToggle(t);
  const following = useIsFollowing(user.id, fromServer);
  const back = !following && followsMe;
  return (
    <Button
      kind={following ? 'secondary' : 'primary'}
      label={following ? t('people.following') : back ? t('people.followBack') : t('people.follow')}
      accessibilityLabel={following ? t('people.followingUser', { username: user.username })
        : back ? t('people.followBackUser', { username: user.username }) : t('people.followUser', { username: user.username })}
      onPress={() => toggle(user, following)}
      style={compact ? { minHeight: 36, paddingHorizontal: 16 } : undefined}
    />
  );
}
