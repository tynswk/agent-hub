import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Folder, Terminal, Wallet } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { tabBoot } from '@/tabState';
import { BAR_H, TAB_BLUR_INTENSITY, TAB_GLASS_ALPHA, useTheme } from '@/theme';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export const LAST_TAB_KEY = 'agenthub.lastTab';

const ICONS = { index: Terminal, kakeibo: Wallet, drive: Folder } as const;
const PAD = 5;
const SPRING = { damping: 22, stiffness: 260, mass: 0.7 };

export function PillTabBar({ state, navigateToTab }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const n = state.routes.length;
  const barW = Math.min(width - 48, 280);
  const step = (barW - PAD * 2) / n;
  const pillH = BAR_H - PAD * 2;

  const pos = useSharedValue(state.index);
  const startPos = useSharedValue(state.index);

  useEffect(() => {
    pos.value = tabBoot.instant ? state.index : withSpring(state.index, SPRING);
    AsyncStorage.setItem(LAST_TAB_KEY, state.routes[state.index].name).catch(() => {});
  }, [state.index, state.routes, pos]);

  const go = (index: number) => {
    const route = state.routes[index];
    if (!route || index === state.index) return;
    Haptics.selectionAsync();
    navigateToTab(route.key);
  };

  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    failOffsetY: [-14, 14],
    onBegin: () => {
      'worklet';
      startPos.value = pos.value;
    },
    onUpdate: (e) => {
      'worklet';
      const next = startPos.value + e.translationX / step;
      pos.value = Math.min(n - 1, Math.max(0, next));
    },
    onFinalize: () => {
      'worklet';
      const target = Math.round(pos.value);
      pos.value = withSpring(target, SPRING);
      scheduleOnRN(go, target);
    },
  });

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * step }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 12) }]}
    >
      <GestureDetector gesture={pan}>
        <View
          style={[styles.bar, { width: barW, height: BAR_H, borderColor: t.glassBrd }]}
        >
          <BlurView
            intensity={TAB_BLUR_INTENSITY}
            tint={t.blurTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: `rgba(${t.tabGlassRgb},${TAB_GLASS_ALPHA})` },
            ]}
          />
          <Animated.View
            style={[
              styles.pill,
              { left: PAD, top: PAD, width: step, height: pillH, backgroundColor: t.pillOn },
              pillStyle,
            ]}
          />
          {state.routes.map((route, i) => {
            const Icon = ICONS[route.name as keyof typeof ICONS] ?? Terminal;
            const focused = state.index === i;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel={route.name}
                onPress={() => go(i)}
                style={[styles.item, { left: PAD + i * step, top: PAD, width: step, height: pillH }]}
              >
                <Icon size={22} strokeWidth={2} color={focused ? t.fresh : t.ink2} />
              </Pressable>
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: { borderRadius: BAR_H / 2, borderWidth: 1, overflow: 'hidden' },
  pill: { position: 'absolute', borderRadius: (BAR_H - PAD * 2) / 2 },
  item: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
