import { useTranslation } from 'react-i18next';
import { useFollowToggle, useIsFollowing } from '@/people/follow';
import { Button } from './Button';

/** Follow / Following (App Flow §8.2): flips at once; Following → "Unfollow @x?" first. */
export function FollowButton({ user, following: fromServer, compact }: {
  user: { id: string; username: string };
  following: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const toggle = useFollowToggle(t);
  const following = useIsFollowing(user.id, fromServer);
  return (
    <Button
      kind={following ? 'secondary' : 'primary'}
      label={following ? t('people.following') : t('people.follow')}
      accessibilityLabel={following ? t('people.followingUser', { username: user.username }) : t('people.followUser', { username: user.username })}
      onPress={() => toggle(user, following)}
      style={compact ? { minHeight: 36, paddingHorizontal: 16 } : undefined}
    />
  );
}
