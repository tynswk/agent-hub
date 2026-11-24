'use no memo';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Folder, FolderOpen, Pin } from 'lucide-react-native';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileRow, useTick } from '@/components/drive/RecentList';
import { FileName } from '@/components/drive/parts';
import { GlassMenu, type GlassMenuHandle } from '@/components/GlassMenu';
import { Loader } from '@/components/Loader';
import { Press } from '@/components/Press';
import { type DFile, getRootId, reg } from '@/lib/drive/api';
import { initTree, loadKids, pinStore, resolvePins, toggleDir, togglePin, treeStore } from '@/lib/drive/data';
import { BAR_H, HEADER_H, useTheme } from '@/theme';

type Node =
  | { t: 'sep'; key: string; label: string }
  | {
      t: 'dir';
      key: string;
      id: string;
      name: string;
      depth: number;
      pin: boolean;
      path: string;
      open: boolean;
      count: number | null;
    }
  | { t: 'file'; key: string; f: DFile; depth: number }
  | { t: 'empty'; key: string; depth: number }
  | { t: 'load'; key: string; depth: number };

const INDENT = 18;

function Chevron({ open }: { open: boolean }) {
  const t = useTheme();
  const r = useSharedValue(open ? 90 : 0);
  useEffect(() => {
    r.value = withTiming(open ? 90 : 0, { duration: 140 });
  }, [open, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <ChevronRight size={17} color={t.ink2} strokeWidth={2.2} />
    </Animated.View>
  );
}

function DirRow({
  n,
  onMenu,
}: {
  n: Extract<Node, { t: 'dir' }>;
  onMenu: (n: Extract<Node, { t: 'dir' }>, a: { x: number; y: number; w: number; h: number }) => void;
}) {
  const t = useTheme();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const Icon = n.pin ? Pin : n.open ? FolderOpen : Folder;
  return (
    <Animated.View entering={FadeIn.duration(140)}>
      <View ref={ref} collapsable={false}>
      <Press
        onPress={() => toggleDir(n.key, n.id)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          ref.current?.measureInWindow((x, y, w, h) => onMenu(n, { x, y, w, h }));
        }}
        delayLongPress={380}
        style={[styles.row, { paddingLeft: 12 + n.depth * INDENT }]}
        accessibilityLabel={n.name}
      >
        <View style={styles.chev}>
          <Chevron open={n.open} />
        </View>
        <Icon size={20} color={n.pin ? t.fresh : t.ink2} strokeWidth={1.9} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <FileName name={n.name} folder style={[styles.name, { color: t.ink }]} />
        </View>
        {n.count != null && n.count > 0 ? <Text style={[styles.count, { color: t.ink2 }]}>{n.count}</Text> : null}
      </Press>
      </View>
    </Animated.View>
  );
}

export function TreeList({ onOpen }: { onOpen: (f: DFile) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tree = treeStore.useStore();
  const pins = pinStore.useStore().pins;
  const tick = useTick(30_000);
  const menuRef = useRef<GlassMenuHandle>(null);
  const [menuFor, setMenuFor] = useState<{ path: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void initTree();
  }, []);
  useEffect(() => {
    void resolvePins(pins);
  }, [pins]);

  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    const walk = (id: string, depth: number, base: string) => {
      const k = tree.kids[id];
      if (!k) {
        out.push({ t: 'load', key: 'load-' + id + depth, depth });
        return;
      }
      for (const f of k.folders) {
        const path = base ? base + '/' + f.name : f.name;
        const open = tree.open.includes(f.id);
        const kk = tree.kids[f.id];
        out.push({
          t: 'dir',
          key: f.id,
          id: f.id,
          name: f.name,
          depth,
          pin: false,
          path,
          open,
          count: kk ? kk.folders.length + kk.files.length : null,
        });
        if (open) walk(f.id, depth + 1, path);
      }
      for (const f of k.files) {
        reg.set(f.id, f);
        out.push({ t: 'file', key: f.id + '@' + depth, f, depth });
      }
      if (!k.folders.length && !k.files.length) out.push({ t: 'empty', key: 'empty-' + id + depth, depth });
    };
    out.push({ t: 'sep', key: 'sep-pin', label: 'ピン留め' });
    for (const p of pins) {
      const id = tree.pinIds[p];
      if (!id) continue;
      const key = 'pin:' + id;
      const open = tree.open.includes(key);
      const kk = tree.kids[id];
      out.push({
        t: 'dir',
        key,
        id,
        name: p.split('/').pop() ?? p,
        depth: 0,
        pin: true,
        path: p,
        open,
        count: kk ? kk.folders.length + kk.files.length : null,
      });
      if (open) walk(id, 1, p);
    }
    out.push({ t: 'sep', key: 'sep-drive', label: 'マイドライブ' });
    if (tree.rootId) walk(tree.rootId, 0, '');
    return out;
  }, [tree, pins]);

  const pinned = menuFor ? pins.includes(menuFor.path) : false;

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        data={nodes}
        extraData={tick}
        keyExtractor={(n) => n.key}
        getItemType={(n) => n.t}
        renderItem={({ item: n }) => {
          if (n.t === 'sep') return <Text style={[styles.sep, { color: t.ink2 }]}>{n.label}</Text>;
          if (n.t === 'dir')
            return (
              <DirRow
                n={n}
                onMenu={(node, a) => {
                  setMenuFor({ path: node.path });
                  menuRef.current?.openAt(a);
                }}
              />
            );
          if (n.t === 'file')
            return (
              <FileRow f={n.f} tree indent={14 + n.depth * INDENT} onOpen={onOpen} />
            );
          if (n.t === 'load')
            return (
              <View style={{ paddingLeft: 40 + n.depth * INDENT, paddingVertical: 10, alignItems: 'flex-start' }}>
                <Loader size={16} />
              </View>
            );
          return (
            <Text style={[styles.emptyNode, { color: t.ink2, paddingLeft: 52 + n.depth * INDENT }]}>空のフォルダ</Text>
          );
        }}
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_H + 4,
          paddingBottom: BAR_H + insets.bottom + 110,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([
                getRootId().then(loadKids),
                ...tree.open.map((k) => loadKids(k.replace(/^pin:/, ''))),
              ]).catch(() => undefined);
              setRefreshing(false);
            }}
            progressViewOffset={insets.top + HEADER_H}
            tintColor={t.ink2}
          />
        }
      />
      <GlassMenu
        ref={menuRef}
        width={200}
        items={[
          {
            key: 'pin',
            label: pinned ? 'ピンを外す' : 'ピン留め',
            onSelect: () => menuFor && togglePin(menuFor.path),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sep: { fontSize: 12.5, fontWeight: '700', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 18, paddingVertical: 10, gap: 8 },
  chev: { width: 20, alignItems: 'center' },
  name: { fontSize: 16 },
  count: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  emptyNode: { fontSize: 14, paddingVertical: 8 },
});
