// The like animations (Design Brief §5): the heart over the photo on a double-tap (scales 0 → 1.2
// → 1, then fades; 600 ms) and the like button's bounce (250 ms). React Native's Animated with the
// native driver keeps them on the UI thread; with the OS "Reduce motion" setting on, they fade only.
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Icon } from './Icon';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (live) setReduce(on); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduce;
}

export interface HeartBurstHandle { play: () => void }

/** The big heart over the photo; `play()` on a double-tap like. Sits over its parent, ignores touches. */
export function HeartBurst({ ref }: { ref?: Ref<HeartBurstHandle> }) {
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(0));

  useImperativeHandle(ref, () => ({
    play: () => {
      scale.stopAnimation();
      opacity.stopAnimation();
      scale.setValue(reduce ? 1 : 0);
      opacity.setValue(reduce ? 0 : 1);
      Animated.parallel([
        reduce
          ? Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true })
          : Animated.sequence([
            Animated.timing(scale, { toValue: 1.2, duration: 200, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
          ]),
        Animated.sequence([
          Animated.delay(reduce ? 300 : 400),
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]).start();
    },
  }), [reduce, scale, opacity]);

  return (
    <Animated.View pointerEvents="none" style={[styles.burst, { opacity, transform: [{ scale }] }]}>
      <Icon name="heart" size={96} color="#FFFFFF" filled strokeWidth={1} />
    </Animated.View>
  );
}

/** The ❤️ in the action bar: filled and like-coloured when liked (never colour alone), bounces on a like. */
export function LikeButton({ liked, onPress }: { liked: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const wasLiked = useRef(liked);

  useEffect(() => {
    if (liked && !wasLiked.current && !reduce) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 120, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    wasLiked.current = liked;
  }, [liked, reduce, scale]);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={liked ? t('feed.unlike') : t('feed.like')}
      accessibilityState={{ selected: liked }} hitSlop={4} style={styles.action}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon name="heart" color={liked ? colors.like : colors.text} filled={liked} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  burst: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  action: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
