'use no memo';
// ビューアを閉じても続く再生の小さなバー。タブバーの上に出る。タップかスワイプ上で全画面に戻る
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Film, Music, Pause, Play, X } from 'lucide-react-native';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Press } from '@/components/Press';
import { media, stopMedia, togglePlay } from '@/lib/drive/media';
import { openFile } from '@/lib/drive/open';
import { BAR_H, useTheme } from '@/theme';

export function MiniPlayer() {
  const t = useTheme();
  const m = media.useStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const f = m.file;

  const expand = () => {
    const cur = media.get().file;
    if (cur) openFile(cur);
  };
  const dy = useSharedValue(0);
  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-20, 20],
    onUpdate: (e) => {
      'worklet';
      dy.value = e.translationY;
    },
    onFinalize: () => {
      'worklet';
      const up = dy.value < -24;
      dy.value = 0;
      if (up) scheduleOnRN(expand);
    },
  });

  if (!f || m.viewerOpen) return null;
  const isVideo = f.mimeType.startsWith('video/');
  const Icon = isVideo ? Film : Music;
  const frac = m.duration > 0 ? Math.min(1, m.time / m.duration) : 0;
  const bottom = Math.max(insets.bottom - 6, 12) + BAR_H + 10;
  const w = Math.min(width - 24, 420);

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(120)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={pan}>
        <View style={[styles.bar, { width: w, borderColor: t.glassBrd }]}>
          <BlurView intensity={80} tint={t.blurTint} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass }]} />
          <Press
            onPress={() => {
              Haptics.selectionAsync();
              expand();
            }}
            style={styles.main}
            accessibilityLabel="全画面に戻る"
          >
            <View style={[styles.thumb, { backgroundColor: t.field }]}>
              <Icon size={20} color={t.fresh} strokeWidth={1.9} />
            </View>
            <Text style={[styles.name, { color: t.ink }]} numberOfLines={1}>
              {f.name}
            </Text>
          </Press>
          <Press mode="dim" onPress={togglePlay} style={styles.btn} accessibilityLabel={m.playing ? '一時停止' : '再生'}>
            {m.playing ? (
              <Pause size={21} color={t.ink} fill={t.ink} />
            ) : (
              <Play size={21} color={t.ink} fill={t.ink} style={{ marginLeft: 2 }} />
            )}
          </Press>
          <Press mode="dim" onPress={stopMedia} style={styles.btn} accessibilityLabel="閉じる">
            <X size={20} color={t.ink2} />
          </Press>
          <View style={[styles.prog, { width: `${frac * 100}%`, backgroundColor: t.fresh }]} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  bar: {
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  main: { flex: 1, height: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10 },
  thumb: { width: 38, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  btn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  prog: { position: 'absolute', left: 0, bottom: 0, height: 2 },
});
