import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

type Listener = (msg: string) => void;
let listener: Listener | null = null;

// どこからでも呼べる（コンポーネントの外からも）
export function toast(msg: string) {
  listener?.(msg);
}

// ルートに 1 つだけ置く。上から小さく出て、2.2 秒で戻る。
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState('');
  const y = useSharedValue(-120);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (m) => {
      setMsg(m);
      y.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        y.value = withTiming(-120, { duration: 150, easing: Easing.out(Easing.cubic) });
      }, 2200);
    };
    return () => {
      listener = null;
    };
  }, [y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }, style]}>
      <View style={[styles.pill, { borderColor: t.glassBrd }]}>
        <BlurView intensity={60} tint={t.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass }]} />
        <Text style={[styles.text, { color: t.ink }]} numberOfLines={2}>
          {msg}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  pill: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 9,
    maxWidth: '86%',
  },
  text: { fontSize: 13.5, fontWeight: '600' },
});
