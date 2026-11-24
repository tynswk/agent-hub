import * as Haptics from 'expo-haptics';
import { type ReactNode, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Press } from '@/components/Press';
import { useTheme } from '@/theme';

const BTN_W = 78;
const FULL = 0.45; // 行幅のこの割合を超えて離したら、そのまま削除

// 開いている行は同時に 1 つだけ
let openRow: { close: () => void } | null = null;

// 左スワイプで削除ボタン。45% を超えるフルスワイプは離した時点で削除。届いた瞬間に振動する。
export function SwipeRow({
  children,
  onPress,
  onDelete,
}: {
  children: ReactNode;
  onPress: () => void;
  onDelete: () => void;
}) {
  const dark = useTheme().dark;
  const tx = useSharedValue(0);
  const base = useSharedValue(0);
  const w = useSharedValue(360);
  const h = useSharedValue(-1);
  const armed = useSharedValue(false);
  const isOpen = useRef(false);
  const self = useRef({ close: () => {} });

  const rowH = useSharedValue(0);

  const doDelete = () => {
    // 行を畳んでから消す
    h.value = rowH.value;
    h.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    setTimeout(onDelete, 200);
  };

  const setOpen = (v: boolean) => {
    isOpen.current = v;
    if (v) {
      if (openRow && openRow !== self.current) openRow.close();
      openRow = self.current;
    } else if (openRow === self.current) {
      openRow = null;
    }
  };
  self.current.close = () => {
    isOpen.current = false;
    tx.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
  };

  const buzz = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  const pan = usePanGesture({
    activeOffsetX: [-10, 10],
    failOffsetY: [-12, 12],
    onBegin: () => {
      'worklet';
      base.value = isOpenShared(tx.value) ? -BTN_W : 0;
    },
    onUpdate: (e) => {
      'worklet';
      const off = Math.max(-w.value, Math.min(0, base.value + e.translationX));
      tx.value = off;
      const a = off < -w.value * FULL;
      if (a !== armed.value) {
        armed.value = a;
        if (a) scheduleOnRN(buzz);
      }
    },
    onFinalize: () => {
      'worklet';
      const off = tx.value;
      armed.value = false;
      if (off < -w.value * FULL) {
        tx.value = withTiming(-w.value, { duration: 180, easing: Easing.out(Easing.cubic) });
        scheduleOnRN(doDelete);
      } else if (off < -39) {
        tx.value = withTiming(-BTN_W, { duration: 180, easing: Easing.out(Easing.cubic) });
        scheduleOnRN(setOpen, true);
      } else {
        tx.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
        scheduleOnRN(setOpen, false);
      }
    },
  });

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    backgroundColor: tx.value < -1 ? (dark ? '#16171a' : '#eceef1') : 'transparent',
  }));
  const delStyle = useAnimatedStyle(() => ({
    width: Math.max(0, -tx.value),
    backgroundColor: armed.value ? '#d42a30' : '#e5484d',
  }));
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: armed.value ? -26 : 0 }],
  }));
  const wrapStyle = useAnimatedStyle(() =>
    h.value >= 0 ? { height: h.value, opacity: h.value / Math.max(1, rowH.value) } : {},
  );

  return (
    <Animated.View style={[styles.wrap, wrapStyle]}>
      <View
        onLayout={(e) => {
          w.value = e.nativeEvent.layout.width;
          if (h.value < 0) rowH.value = e.nativeEvent.layout.height;
        }}
      >
        <Animated.View style={[styles.del, delStyle]}>
          <Press mode="dim" onPress={doDelete} style={styles.delBtn}>
            <Animated.View style={[styles.delLabel, labelStyle]}>
              <Text style={styles.delText} numberOfLines={1}>
                削除
              </Text>
            </Animated.View>
          </Press>
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={bodyStyle}>
            <Press
              onPress={() => {
                if (isOpen.current) {
                  self.current.close();
                  setOpen(false);
                  return;
                }
                onPress();
              }}
            >
              {children}
            </Press>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

function isOpenShared(v: number) {
  'worklet';
  return v < -BTN_W / 2;
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  del: { position: 'absolute', top: 0, right: 0, bottom: 0, overflow: 'hidden' },
  delBtn: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  delLabel: { width: BTN_W, alignItems: 'center' },
  delText: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
});
