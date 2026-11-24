import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Press } from '@/components/Press';
import { useTheme } from '@/theme';

export type SegOption<K extends string> = { key: K; label: string };

const SPRING = { damping: 22, stiffness: 260, mass: 0.7 };
const PAD = 3;

// ピル型セグメント（支出｜収入、Claude｜Gemini 等）。タップとドラッグで切り替える。
export function PillSegment<K extends string>({
  options,
  value,
  onChange,
  width = 168,
}: {
  options: SegOption<K>[];
  value: K;
  onChange: (k: K) => void;
  width?: number;
}) {
  const t = useTheme();
  const n = options.length;
  const idx = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  );
  const step = (width - PAD * 2) / n;
  const pos = useSharedValue(idx);
  const start = useSharedValue(idx);

  useEffect(() => {
    pos.value = withSpring(idx, SPRING);
  }, [idx, pos]);

  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.key === value) return;
    Haptics.selectionAsync();
    onChange(o.key);
  };

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    onBegin: () => {
      'worklet';
      start.value = pos.value;
    },
    onUpdate: (e) => {
      'worklet';
      pos.value = Math.min(n - 1, Math.max(0, start.value + e.translationX / step));
    },
    onFinalize: () => {
      'worklet';
      const target = Math.round(pos.value);
      pos.value = withSpring(target, SPRING);
      scheduleOnRN(pick, target);
    },
  });

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * step }] }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.wrap, { width, backgroundColor: t.field, borderColor: t.glassBrd }]}>
        <Animated.View
          style={[styles.pill, { left: PAD, top: PAD, width: step, backgroundColor: t.pillOn }, pillStyle]}
        />
        {options.map((o, i) => (
          <Press
            key={o.key}
            mode="dim"
            onPress={() => pick(i)}
            style={[styles.item, { left: PAD + i * step, width: step }]}
          >
            <Text style={[styles.label, { color: o.key === value ? t.ink : t.ink2 }]}>{o.label}</Text>
          </Press>
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 36, borderRadius: 18, borderWidth: 1 },
  pill: { position: 'absolute', height: 28, borderRadius: 14 },
  item: { position: 'absolute', top: PAD, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600' },
});
