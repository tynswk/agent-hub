'use no memo';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { ArrowUp, ChevronDown, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileName, KindIcon } from '@/components/drive/parts';
import { GlassMenu } from '@/components/GlassMenu';
import { Loader } from '@/components/Loader';
import { Press } from '@/components/Press';
import { type DFile, reg } from '@/lib/drive/api';
import { ALL, checkRecent, driveUi, loadRecent, pinStore, recentStore, setScope } from '@/lib/drive/data';
import { nowPlaying } from '@/lib/drive/media';
import { ago, freshness, groupOf } from '@/lib/drive/util';
import { BAR_H, HEADER_H, useTheme } from '@/theme';

type Item = { t: 'h'; key: string; label: string } | { t: 'row'; key: string; f: DFile };

export function useTick(ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

export function FileRow({
  f,
  tree,
  indent = 0,
  onOpen,
}: {
  f: DFile;
  tree?: boolean;
  indent?: number;
  onOpen: (f: DFile) => void;
}) {
  const t = useTheme();
  const playId = nowPlaying.use().id;
  const fr = freshness(f.t);
  const playing = playId === f.id;
  const accent = playing || fr === 'fresh';
  return (
    <Press onPress={() => onOpen(f)} style={[styles.row, { paddingLeft: 18 + indent }]}>
      <View style={styles.ico}>
        <KindIcon file={f} color={playing ? t.fresh : fr === 'fresh' ? t.fresh : t.ink2} />
      </View>
      <View style={styles.label}>
        <FileName
          name={f.name}
          style={[styles.name, { color: playing ? t.fresh : t.ink }]}
        />
        {tree || !f.path ? null : (
          <Text style={[styles.path, { color: t.ink2 }]} numberOfLines={1}>
            {f.path}
          </Text>
        )}
      </View>
      <Text style={[styles.time, { color: accent ? t.fresh : fr === 'warm' ? t.ink : t.ink2 }]}>{ago(f.t)}</Text>
    </Press>
  );
}

export function RecentList({ onOpen }: { onOpen: (f: DFile) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const ui = driveUi.use();
  const rs = recentStore.use();
  const pins = pinStore.use().pins;
  const tick = useTick(30_000);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlashListRef<Item>>(null);

  useEffect(() => {
    void loadRecent();
  }, []);
  // 前面にいる間だけ15秒ごとに新着を見る
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => {
        if (AppState.currentState === 'active') void checkRecent();
      }, 15_000);
      const s = AppState.addEventListener('change', (st) => {
        if (st === 'active') void checkRecent();
      });
      return () => {
        clearInterval(id);
        s.remove();
      };
    }, []),
  );

  const items = useMemo<Item[]>(() => {
    const q = ui.query.trim().toLowerCase();
    const out: Item[] = [];
    let g = '';
    for (const f of rs.items ?? []) {
      if (q && !f.name.toLowerCase().includes(q)) continue;
      reg.set(f.id, f);
      const gg = groupOf(f.t);
      if (gg !== g) {
        g = gg;
        out.push({ t: 'h', key: 'h-' + gg, label: gg });
      }
      out.push({ t: 'row', key: f.id, f });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rs.items, ui.query, tick]);

  const scopeItems = [...pins, ALL].map((o) => ({
    key: o,
    label: o,
    onSelect: () => setScope(o),
  }));

  const showNewer = async () => {
    Haptics.selectionAsync();
    await loadRecent(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const header = (
    <View style={styles.controls}>
      <View style={[styles.search, { backgroundColor: t.field, borderColor: t.glassBrd }]}>
        <Search size={17} color={t.ink2} />
        <TextInput
          value={ui.query}
          onChangeText={(v) => driveUi.set({ query: v })}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="ファイル名で検索"
          style={[styles.input, { color: t.ink }]}
          selectionColor={t.fresh}
        />
        {ui.query ? (
          <Press mode="dim" onPress={() => driveUi.set({ query: '' })} style={styles.clear} accessibilityLabel="消去">
            <X size={16} color={t.ink2} />
          </Press>
        ) : null}
      </View>
      <GlassMenu items={scopeItems} selectedKey={ui.scope} width={250}>
        {(open) => (
          <Press
            mode="dim"
            onPress={open}
            style={[styles.scope, { backgroundColor: t.field, borderColor: t.glassBrd }]}
          >
            <Text style={[styles.scopeText, { color: t.ink }]} numberOfLines={1}>
              {ui.scope}
            </Text>
            <ChevronDown size={16} color={t.ink2} />
          </Press>
        )}
      </GlassMenu>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        ref={listRef}
        data={items}
        extraData={tick}
        keyExtractor={(i) => i.key}
        getItemType={(i) => i.t}
        ListHeaderComponent={header}
        ListEmptyComponent={
          rs.items && !rs.loading ? (
            <Text style={[styles.empty, { color: t.ink2 }]}>ファイルはありません</Text>
          ) : (
            <View style={{ padding: 26, alignItems: 'flex-start' }}>
              <Loader />
            </View>
          )
        }
        renderItem={({ item }) =>
          item.t === 'h' ? (
            <Text style={[styles.group, { color: t.ink2 }]}>{item.label}</Text>
          ) : (
            <FileRow f={item.f} onOpen={onOpen} />
          )
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_H + 8,
          paddingBottom: BAR_H + insets.bottom + 110,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadRecent(true);
              setRefreshing(false);
            }}
            progressViewOffset={insets.top + HEADER_H}
            tintColor={t.ink2}
          />
        }
      />
      {rs.pending > 0 ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(120)}
          style={[styles.pillWrap, { top: insets.top + HEADER_H + 8 + 38 + 8 }]}
        >
          <Press
            onPress={showNewer}
            style={[styles.pill, { backgroundColor: t.paper2, borderColor: t.glassBrd }]}
          >
            <ArrowUp size={15} color={t.fresh} strokeWidth={2.4} />
            <Text style={[styles.pillText, { color: t.fresh }]}>新着 {rs.pending} 件</Text>
          </Press>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 6 },
  search: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    gap: 7,
  },
  input: { flex: 1, fontSize: 15.5, paddingVertical: 0, height: 38 },
  clear: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  scope: {
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    paddingLeft: 13,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 170,
  },
  scopeText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  group: { fontSize: 12.5, fontWeight: '700', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 9, gap: 12 },
  ico: { width: 24, alignItems: 'center' },
  label: { flex: 1, minWidth: 0 },
  name: { fontSize: 16 },
  path: { fontSize: 12.5, marginTop: 1 },
  time: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  empty: { padding: 24, fontSize: 15 },
  pillWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillText: { fontSize: 14, fontWeight: '700' },
});
