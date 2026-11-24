'use no memo';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Play, Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { AppState, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LimitRing } from '@/components/LimitRing';
import { Loader } from '@/components/Loader';
import { Press } from '@/components/Press';
import { ScreenShell } from '@/components/ScreenShell';
import {
  LIMITS_META,
  type Session,
  ago,
  isFresh,
  keyOf,
  limSheet,
  reloadLimits,
  reloadSessions,
  sessUi,
  toggleSession,
  useLimits,
  useSessions,
} from '@/lib/sessions';
import { BAR_H, HEADER_H, useTheme } from '@/theme';

const LIM_H = 76;
const SLIDE = LinearTransition.duration(240);

type Item = { t: 'sec'; key: string; label: string } | { t: 'row'; key: string; s: Session };

function Row({ s, busy }: { s: Session; busy: boolean }) {
  const t = useTheme();
  const fresh = isFresh(s.last_active);
  return (
    <Animated.View layout={SLIDE} style={[styles.srow, { borderBottomColor: t.glassBrd }]}>
      <View
        style={[styles.dot, fresh ? { backgroundColor: t.fresh } : { backgroundColor: t.ink2, opacity: 0.35 }]}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.ttl, { color: t.ink }]} numberOfLines={1}>
          {s.title || '（無題）'}
        </Text>
        <Text style={[styles.sub, { color: t.ink2 }]} numberOfLines={1}>
          {s.model}
        </Text>
      </View>
      <Text style={[styles.time, { color: fresh ? t.fresh : t.ink2 }]}>{ago(s.last_active)}</Text>
      <Press
        mode="dim"
        disabled={busy || !!s.isNew}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          void toggleSession(s);
        }}
        style={styles.act}
        accessibilityLabel={s.running ? '停止' : '再開'}
      >
        {busy || s.isNew ? (
          <Loader />
        ) : s.running ? (
          <View style={[styles.stop, { backgroundColor: t.red }]} />
        ) : (
          <Play size={17} color={t.green} fill={t.green} style={{ marginLeft: 2 }} />
        )}
      </Press>
    </Animated.View>
  );
}

export default function SessionsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const q = useSessions();
  const lq = useLimits();
  const { pending, starting } = sessUi.use();
  const [refreshing, setRefreshing] = useState(false);

  // 前面にいる間だけ：一覧は30秒ごと、上限は5分ごと
  useFocusEffect(
    useCallback(() => {
      const a = setInterval(() => {
        if (AppState.currentState === 'active') void reloadSessions();
      }, 30_000);
      const b = setInterval(() => {
        if (AppState.currentState === 'active') void reloadLimits();
      }, 300_000);
      const s = AppState.addEventListener('change', (st) => {
        if (st === 'active') void reloadSessions();
      });
      return () => {
        clearInterval(a);
        clearInterval(b);
        s.remove();
      };
    }, []),
  );

  const items = useMemo<Item[]>(() => {
    const list = q.data ?? [];
    const run: Session[] = [];
    const stop: Session[] = [];
    for (const s of list) ((pending[keyOf(s)] ?? s.running) ? run : stop).push(s);
    const out: Item[] = [];
    if (starting || run.length) {
      out.push({ t: 'sec', key: 'sec-run', label: '実行中' });
      if (starting) out.push({ t: 'row', key: keyOf(starting), s: starting });
      run.forEach((s) => out.push({ t: 'row', key: keyOf(s), s }));
    }
    if (stop.length) {
      out.push({ t: 'sec', key: 'sec-stop', label: '停止中' });
      stop.forEach((s) => out.push({ t: 'row', key: keyOf(s), s }));
    }
    return out;
  }, [q.data, pending, starting]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([q.refetch(), lq.refetch()]);
    setRefreshing(false);
  };

  const top = insets.top + HEADER_H;
  const plus = (
    <Press
      mode="dim"
      disabled={!!starting}
      onPress={() => router.push('/session-new')}
      style={[styles.plus, { borderColor: t.glassBrd, backgroundColor: t.field, opacity: starting ? 0.5 : 1 }]}
      accessibilityLabel="新規セッション"
    >
      <Plus size={21} color={t.ink} />
    </Press>
  );

  return (
    <ScreenShell title="セッション" right={plus}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingTop: top + LIM_H, paddingBottom: BAR_H + insets.bottom + 48 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={top + LIM_H}
            tintColor={t.ink2}
          />
        }
      >
        {items.map((it) =>
          it.t === 'sec' ? (
            <Animated.Text key={it.key} layout={SLIDE} style={[styles.sec, { color: t.ink2 }]}>
              {it.label}
            </Animated.Text>
          ) : (
            <Row key={it.key} s={it.s} busy={keyOf(it.s) in pending} />
          ),
        )}
        {!items.length ? (
          q.isError ? (
            <Text style={[styles.empty, { color: t.ink2 }]}>読み込めませんでした（{(q.error as Error).message}）</Text>
          ) : q.isPending ? (
            <View style={{ padding: 26, alignItems: 'flex-start' }}>
              <Loader />
            </View>
          ) : (
            <Text style={[styles.empty, { color: t.ink2 }]}>セッションがありません</Text>
          )
        ) : null}
      </Animated.ScrollView>

      <View style={[styles.lims, { top, height: LIM_H, borderBottomColor: t.glassBrd }]}>
        <BlurView intensity={60} tint={t.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass2 }]} />
        {LIMITS_META.map((m) => (
          <Press
            key={m.id}
            mode="dim"
            style={styles.lim}
            onPress={() => {
              limSheet.set({ id: m.id });
              router.push('/limit');
            }}
          >
            <Text style={[styles.limNm, { color: t.ink }]} numberOfLines={1}>
              {m.name}
            </Text>
            <LimitRing value={lq.data?.[m.id]?.remain ?? null} size={34} stroke={4} font={11} />
            <Text style={[styles.limSub, { color: t.ink2 }]} numberOfLines={1}>
              {m.sub || ' '}
            </Text>
          </Press>
        ))}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  plus: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lims: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  lim: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 0 },
  limNm: { fontSize: 11, fontWeight: '600' },
  limSub: { fontSize: 10 },
  srow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ttl: { fontSize: 15 },
  sub: { fontSize: 11.5, marginTop: 2 },
  time: { fontSize: 11.5 },
  act: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stop: { width: 13, height: 13, borderRadius: 3 },
  sec: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4, fontSize: 12, letterSpacing: 0.6 },
  empty: { padding: 26, fontSize: 13.5 },
});
