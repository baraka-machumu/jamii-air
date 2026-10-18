// A caption with its hashtags tappable (BR-FD-10/11). Used by the feed card, the post detail and
// the pinned caption above a post's comments, so a tag behaves the same everywhere.
import { useRouter } from 'expo-router';
import { captionParts } from '@/posting/hashtags';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function Caption({ caption, username, onUsernamePress, numberOfLines, onPress }: {
  caption: string;
  /** Shown in bold before the caption, as the designs have it. */
  username?: string;
  onUsernamePress?: () => void;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const openTag = (tag: string) => router.push({ pathname: '/t/[tag]', params: { tag } });

  return (
    <Text numberOfLines={numberOfLines} onPress={onPress}>
      {username ? <Text variant="bodyStrong" onPress={onUsernamePress}>{username} </Text> : null}
      {captionParts(caption).map((part, index) => (part.tag
        ? (
          <Text key={`${index}-${part.text}`} color={colors.primary} accessibilityRole="link"
            onPress={() => openTag(part.tag!)}>
            {part.text}
          </Text>
        )
        : <Text key={`${index}-plain`}>{part.text}</Text>))}
    </Text>
  );
}
