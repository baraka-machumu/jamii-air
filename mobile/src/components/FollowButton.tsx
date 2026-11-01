import { useTranslation } from 'react-i18next';
import { type FollowStatus, useFollowStatus, useFollowToggle } from '@/people/follow';
import { Button } from './Button';

/**
 * Follow / Following (App Flow §8.2): flips at once; Following → "Unfollow @x?" first.
 * Someone who follows you and you don't follow yet gets "Follow back" (§9). A private account
 * that has not accepted yet reads Requested, and a tap offers to cancel (§8.2a).
 */
export function FollowButton({ user, following, requested = false, followsMe, compact }: {
  user: { id: string; username: string; isPrivate?: boolean };
  following: boolean;
  /** The server says you asked to follow and are waiting. */
  requested?: boolean;
  followsMe?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const toggle = useFollowToggle(t);
  const fromServer: FollowStatus = following ? 'following' : requested ? 'requested' : 'none';
  const status = useFollowStatus(user.id, fromServer);
  const back = status === 'none' && followsMe;
  const label = status === 'following' ? t('people.following')
    : status === 'requested' ? t('people.requested')
      : back ? t('people.followBack') : t('people.follow');
  const a11y = status === 'following' ? t('people.followingUser', { username: user.username })
    : status === 'requested' ? t('people.requestedUser', { username: user.username })
      : back ? t('people.followBackUser', { username: user.username }) : t('people.followUser', { username: user.username });
  return (
    <Button
      kind={status === 'none' ? 'brand' : 'secondary'}
      label={label}
      accessibilityLabel={a11y}
      onPress={() => toggle(user, status)}
      style={compact ? { minHeight: 36, paddingHorizontal: 16 } : undefined}
    />
  );
}
