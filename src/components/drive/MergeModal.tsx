'use no memo';
// 保存時の衝突（3方向マージ）。DESIGN §8：相手の変更＝琥珀、自分の変更＝青、削除＝打ち消し線
import { FlashList } from '@shopify/flash-list';
import { X } from 'lucide-react-native';
import { useMemo } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillSegment } from '@/components/PillSegment';
import { Press } from '@/components/Press';
import type { Chunk } from '@/lib/drive/diff';
import { MONO, useTheme } from '@/theme';

export type MergeState = { chunks: Chunk[]; theirsV: string; onlyChanges: boolean };
export type MergeAction = 'reload' | 'overwrite' | 'merge' | 'cancel';

type Row =
  | { k: 'ln'; key: string; cls: 'ctx' | 'theirs' | 'mine' | 'del'; text: string }
  | { k: 'gap'; key: string }
  | { k: 'head'; key: string; idx: number; pick: 'theirs' | 'mine' | 'both' }
  | { k: 'tag'; key: string; label: string; on: boolean };

const MINE = '#4c8dff';

export function MergeModal({
  state,
  onChange,
  onAction,
}: {
  state: MergeState | null;
  onChange: (s: MergeState) => void;
  onAction: (a: MergeAction) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rows = useMemo<Row[]>(() => {
    if (!state) return [];
    const { chunks, onlyChanges } = state;
    const out: Row[] = [];
    let gap = false;
    let n = 0;
    const L = (cls: 'ctx' | 'theirs' | 'mine' | 'del', text: string) =>
      out.push({ k: 'ln', key: `l${n++}`, cls, text });
    chunks.forEach((c, idx) => {
      if (c.t === 'same') {
        const near = chunks.slice(Math.max(0, idx - 2), idx + 3).some((x) => x.t !== 'same');
        if (!onlyChanges || near) {
          L('ctx', c.lines[0]);
          gap = false;
        } else if (!gap) {
          out.push({ k: 'gap', key: `g${n++}` });
          gap = true;
        }
        return;
      }
      gap = false;
      if (c.t === 'conflict') {
        out.push({ k: 'head', key: `h${idx}`, idx, pick: c.pick });
        const on = (k: string) => c.pick === k || c.pick === 'both';
        out.push({ k: 'tag', key: `ta${idx}`, label: '相手', on: on('theirs') });
        if (c.theirs.length) c.theirs.forEach((x) => L('theirs', x));
        else L('del', '（削除）');
        out.push({ k: 'tag', key: `tb${idx}`, label: '自分', on: on('mine') });
        if (c.mine.length) c.mine.forEach((x) => L('mine', x));
        else L('del', '（削除）');
        return;
      }
      const who = c.t === 'mine' ? 'mine' : 'theirs';
      c.base.forEach((x) => L('del', x));
      c.lines.forEach((x) => L(who, x));
    });
    return out;
  }, [state]);

  if (!state) return null;
  const n = (k: string) => state.chunks.filter((c) => c.t === k).length;
  const conflicts = n('conflict');
  const top = Platform.OS === 'android' ? insets.top : 12;

  const BAND = { theirs: t.fresh, mine: MINE, del: t.red, ctx: 'transparent' } as const;

  return (
    <Modal visible animationType="slide" onRequestClose={() => onAction('cancel')} presentationStyle="pageSheet">
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.paper2 }}>
        <View style={[styles.head, { paddingTop: top, borderBottomColor: t.line }]}>
          <Press mode="dim" onPress={() => onAction('cancel')} style={styles.x} accessibilityLabel="編集に戻る">
            <X size={21} color={t.ink} />
          </Press>
          <Text style={[styles.title, { color: t.ink }]}>{conflicts ? `衝突 ${conflicts}か所` : '別の場所で更新あり'}</Text>
          <PillSegment
            width={150}
            options={[
              { key: 'chg', label: '変更箇所' },
              { key: 'all', label: '全文' },
            ]}
            value={state.onlyChanges ? 'chg' : 'all'}
            onChange={(k) => onChange({ ...state, onlyChanges: k === 'chg' })}
          />
        </View>
        <View style={styles.stats}>
          <Text style={[styles.stat, { color: t.ink2 }]}>
            相手の変更 <Text style={{ color: t.ink, fontWeight: '700' }}>{n('theirs') + n('both')}</Text>
          </Text>
          <Text style={[styles.stat, { color: t.ink2 }]}>
            自分の変更 <Text style={{ color: t.ink, fontWeight: '700' }}>{n('mine')}</Text>
          </Text>
          <Text style={[styles.stat, { color: t.ink2 }]}>
            衝突 <Text style={{ color: t.ink, fontWeight: '700' }}>{conflicts}</Text>
          </Text>
        </View>
        <FlashList
          data={rows}
          keyExtractor={(r) => r.key}
          getItemType={(r) => r.k}
          renderItem={({ item: r }) => {
            if (r.k === 'gap') return <Text style={[styles.gap, { color: t.ink2 }]}>…</Text>;
            if (r.k === 'tag')
              return (
                <Text style={[styles.tag, { color: r.on ? t.ink : t.ink2 }]}>
                  {r.label}
                  {r.on ? '' : '（外す）'}
                </Text>
              );
            if (r.k === 'head')
              return (
                <View style={styles.hunk}>
                  <Text style={[styles.hunkText, { color: t.ink }]}>この箇所を両方が変えました</Text>
                  <PillSegment
                    width={186}
                    options={[
                      { key: 'theirs', label: '相手' },
                      { key: 'mine', label: '自分' },
                      { key: 'both', label: '両方' },
                    ]}
                    value={r.pick}
                    onChange={(k) =>
                      onChange({
                        ...state,
                        chunks: state.chunks.map((c, i) => (i === r.idx && c.t === 'conflict' ? { ...c, pick: k } : c)),
                      })
                    }
                  />
                </View>
              );
            return (
              <View style={[styles.ln, { borderLeftColor: BAND[r.cls] }]}>
                <Text
                  style={[
                    styles.lnText,
                    { color: r.cls === 'del' ? t.ink2 : t.ink },
                    r.cls === 'del' && { textDecorationLine: 'line-through' },
                  ]}
                >
                  {r.text || ' '}
                </Text>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 12 }}
        />
        <View style={[styles.actions, { borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Press
            onPress={() => onAction('reload')}
            style={[styles.act, { backgroundColor: t.field, borderColor: t.glassBrd }]}
          >
            <Text style={[styles.actText, { color: t.ink }]}>最新を読み込む</Text>
          </Press>
          <Press
            onPress={() => onAction('overwrite')}
            style={[styles.act, { backgroundColor: t.field, borderColor: t.glassBrd }]}
          >
            <Text style={[styles.actText, { color: t.ink }]}>自分の版で上書き</Text>
          </Press>
          <Press onPress={() => onAction('merge')} style={[styles.act, { backgroundColor: t.fresh, borderColor: t.fresh }]}>
            <Text style={[styles.actText, { color: t.dark ? '#000' : '#fff' }]}>マージして保存</Text>
          </Press>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  x: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 10 },
  stat: { fontSize: 13 },
  gap: { paddingHorizontal: 16, paddingVertical: 4, fontSize: 14 },
  tag: { paddingHorizontal: 16, paddingTop: 6, fontSize: 12, fontWeight: '700' },
  hunk: { paddingHorizontal: 16, paddingTop: 12, gap: 8, alignItems: 'flex-start' },
  hunkText: { fontSize: 13.5, fontWeight: '600' },
  ln: { borderLeftWidth: 3, marginLeft: 12, paddingLeft: 8, paddingRight: 12, paddingVertical: 1 },
  lnText: { fontFamily: MONO, fontSize: 12.5, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  act: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actText: { fontSize: 13.5, fontWeight: '700' },
});
