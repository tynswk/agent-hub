import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { type ComponentRef, type ReactNode, type Ref, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Press } from '@/components/Press';
import { useTheme } from '@/theme';

export type MenuItem = { key: string; label: string; onSelect: () => void; danger?: boolean };

export type Anchor = { x: number; y: number; w: number; h: number };
export type GlassMenuHandle = { openAt: (a: Anchor) => void };
const DUR = 140;
const MENU_W = 220;
const ROW_H = 46;

// 押した要素の位置から 0.14 秒でイーズアウトして開くすりガラスのメニュー。外側タップで閉じる。
export function GlassMenu({
  items,
  selectedKey,
  children,
  ref,
  width = MENU_W,
}: {
  items: MenuItem[];
  selectedKey?: string;
  children?: (open: () => void) => ReactNode;
  ref?: Ref<GlassMenuHandle>;
  width?: number;
}) {
  const t = useTheme();
  const { width: sw, height: sh } = useWindowDimensions();
  const box = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [visible, setVisible] = useState(false);
  const k = useSharedValue(0);

  const show = useCallback(
    (a: Anchor) => {
      setAnchor(a);
      setVisible(true);
      k.value = 0;
      k.value = withTiming(1, { duration: DUR, easing: Easing.out(Easing.cubic) });
    },
    [k],
  );
  const open = useCallback(() => {
    box.current?.measureInWindow((x, y, w, h) => show({ x, y, w, h }));
  }, [show]);
  useImperativeHandle(ref, () => ({ openAt: show }), [show]);

  const close = useCallback(
    (after?: () => void) => {
      k.value = withTiming(0, { duration: DUR, easing: Easing.out(Easing.cubic) });
      setTimeout(() => {
        setVisible(false);
        after?.();
      }, DUR);
    },
    [k],
  );

  const menuH = items.length * ROW_H + 8;
  const a = anchor;
  const right = a ? a.x + a.w / 2 > sw / 2 : false;
  const left = a ? Math.max(12, Math.min(sw - width - 12, right ? a.x + a.w - width : a.x)) : 0;
  const below = a ? a.y + a.h + 6 + menuH < sh - 20 : true;
  const top = a ? (below ? a.y + a.h + 6 : a.y - 6 - menuH) : 0;
  const origin = `${right ? 'right' : 'left'} ${below ? 'top' : 'bottom'}` as const;

  const style = useAnimatedStyle(() => ({
    opacity: k.value,
    transform: [{ scale: 0.82 + 0.18 * k.value }],
  }));

  return (
    <>
      {children ? (
        <View ref={box} collapsable={false}>
          {children(open)}
        </View>
      ) : null}
      <Modal transparent visible={visible} animationType="none" onRequestClose={() => close()}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
        <Animated.View
          style={[
            styles.menu,
            { left, top, width, borderColor: t.glassBrd, transformOrigin: origin },
            style,
          ]}
        >
          <BlurView intensity={80} tint={t.blurTint} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass }]} />
          <View style={{ padding: 4 }}>
            {items.map((it) => (
              <Press
                key={it.key}
                style={styles.row}
                onPress={() => {
                  Haptics.selectionAsync();
                  close(it.onSelect);
                }}
              >
                <Text style={[styles.label, { color: it.danger ? t.red : t.ink }]} numberOfLines={1}>
                  {it.label}
                </Text>
                {it.key === selectedKey ? <Check size={18} color={t.fresh} strokeWidth={2.4} /> : null}
              </Press>
            ))}
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: {
    height: ROW_H,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: 15.5, flexShrink: 1 },
});
