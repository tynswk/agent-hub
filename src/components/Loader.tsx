import { LoaderCircle } from 'lucide-react-native';
import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';

// lucide の loader-circle を 1 秒 / 回転
export function Loader({ size = 19, color }: { size?: number; color?: string }) {
  const t = useTheme();
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = 0;
    r.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <LoaderCircle size={size} color={color ?? t.ink2} strokeWidth={2} />
    </Animated.View>
  );
}
