import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Camera, ChevronLeft, ChevronRight, Clock, Pencil } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CatBand, Calendar, DayBars, aggregate } from '@/components/KakeiboCharts';
import { Loader } from '@/components/Loader';
import { Press } from '@/components/Press';
import { ScreenShell } from '@/components/ScreenShell';
import { SwipeRow } from '@/components/SwipeRow';
import { toast } from '@/components/Toast';
import { apiGet, apiPost } from '@/lib/api';
import {
  type Entry,
  type PendingJob,
  dayLabel,
  fmt,
  kkSheet,
  kkView,
  monthNow,
  reloadEntries,
  reloadPending,
  removeEntryFromCache,
  shiftMonth,
  signed,
  useCats,
  useEntries,
  usePending,
} from '@/lib/kakeibo';
import { flushOutbox, openCategorySheet, retryAll, sendManual, stageReceipt, useLocal } from '@/lib/local';
import { BAR_H, HEADER_H, MONO, useTheme } from '@/theme';

type Item =
  | { t: 'sec'; key: string; label: string }
  | { t: 'row'; key: string; e: Entry }
  | { t: 'empty'; key: string; text: string };

async function capture(fromLibrary: boolean) {
  try {
    if (!fromLibrary) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast('カメラの許可がありません');
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const res = fromLibrary
      ? await ImagePicker.launchImageLibraryAsync(opts)
      : await ImagePicker.launchCameraAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await stageReceipt(a.uri, a.width, a.height);
  } catch {
    toast('レシートを端末に保存できませんでした');
  }
}

async function deleteEntry(id: string) {
  removeEntryFromCache(id);
  try {
    const d = await apiPost<{ ok?: boolean; message?: string }>(
      `/api/kakeibo/entries/${encodeURIComponent(id)}/delete`,
      {},
    );
    toast(d.ok ? '削除しました' : d.message || '削除できませんでした');
  } catch {
    toast('削除できませんでした');
  }
  void reloadEntries();
}

export default function KakeiboScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { month, day } = kkView.use();
  const entriesQ = useEntries(month);
  const catsQ = useCats();
  const pendingQ = usePending();
  const local = useLocal();
  const listRef = useRef<FlashListRef<Item>>(null);
  const headH = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const s = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        void reloadEntries();
        void reloadPending();
      }
    });
    return () => s.remove();
  }, []);

  const data = entriesQ.data;
  const { byDay, byCat } = useMemo(() => aggregate(data?.entries ?? []), [data]);

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    const rows = day ? data.entries.filter((r) => r.date === day) : data.entries;
    if (!rows.length) return [{ t: 'empty', key: 'empty', text: '記録はありません' }];
    const out: Item[] = [];
    let cur = '';
    for (const e of rows) {
      if (e.date !== cur) {
        cur = e.date;
        out.push({ t: 'sec', key: 's' + cur, label: dayLabel(cur) });
      }
      out.push({ t: 'row', key: e.id, e });
    }
    return out;
  }, [data, day]);

  const [vy, vm] = month.split('-').map(Number);
  const isNow = month === monthNow();

  const go = (m: string) => kkView.set({ month: m, day: '' });
  const pickDay = (key: string) => {
    const next = day === key ? '' : key;
    kkView.set({ day: next });
    if (next) {
      setTimeout(
        () => listRef.current?.scrollToOffset({ offset: Math.max(0, headH.current - 8), animated: true }),
        60,
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([entriesQ.refetch(), catsQ.refetch(), pendingQ.refetch(), retryAll(true)]);
    setRefreshing(false);
  };

  const openEdit = (e: Entry) => {
    kkSheet.set({ ctx: { mode: 'edit', entry: e } });
    router.push('/manual');
  };
  const openNew = () => {
    kkSheet.set({ ctx: { mode: 'new' } });
    router.push('/manual');
  };
  const openReview = async (id: string) => {
    try {
      const d = await apiGet<{ pending?: PendingJob[] }>('/api/kakeibo/pending');
      const job = (d.pending ?? []).find((j) => j.id === id);
      if (job) {
        kkSheet.set({ ctx: { mode: 'review', job } });
        router.push('/review');
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const round = [styles.nbtn, { borderColor: t.glassBrd, backgroundColor: t.field }];
  const nav = (
    <View style={styles.nav}>
      <Press mode="dim" style={round} onPress={() => go(shiftMonth(month, -1))} accessibilityLabel="前の月">
        <ChevronLeft size={19} color={t.ink} />
      </Press>
      <Text style={[styles.mtitle, { color: t.ink }]}>
        {vy}年{vm}月
      </Text>
      <Press mode="dim" style={round} onPress={() => go(shiftMonth(month, 1))} accessibilityLabel="次の月">
        <ChevronRight size={19} color={t.ink} />
      </Press>
      {!isNow ? (
        <Press
          mode="dim"
          style={[styles.thisM, { borderColor: t.glassBrd, backgroundColor: t.field }]}
          onPress={() => go(monthNow())}
        >
          <Text style={{ color: t.ink, fontSize: 12.5 }}>今月</Text>
        </Press>
      ) : null}
    </View>
  );

  const abtn = [styles.abtn, { borderColor: t.glassBrd, backgroundColor: t.glass2 }];
  const pendingJobs = pendingQ.data ?? [];
  const rowBorder = { borderBottomColor: t.glassBrd };

  const header = (
    <View
      onLayout={(e) => {
        headH.current = e.nativeEvent.layout.height;
      }}
    >
      <View style={styles.sumbar}>
        <Text style={[styles.tot, { color: t.ink }]}>{data ? signed(data.total) : '—'}</Text>
        {data ? (
          <View>
            <Text style={[styles.bd, { color: t.ink2 }]}>支出 −{fmt(data.expense)}</Text>
            <Text style={[styles.bd, { color: t.ink2 }]}>収入 +{fmt(data.income)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actrow}>
        <Press
          style={abtn}
          onPress={() => void capture(false)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            void capture(true);
          }}
          delayLongPress={350}
        >
          <Camera size={19} color={t.ink} />
          <Text style={{ color: t.ink, fontSize: 14 }}>撮影</Text>
        </Press>
        <Press style={abtn} onPress={openNew}>
          <Pencil size={18} color={t.ink} />
          <Text style={{ color: t.ink, fontSize: 14 }}>手入力</Text>
        </Press>
      </View>

      {local.receipts.map((r) => (
        <Press key={r.key} style={[styles.srow, rowBorder]} onPress={() => void flushOutbox(true)}>
          <Clock size={19} color={t.fresh} />
          <Text style={[styles.ttl, { color: t.ink, flex: 1 }]}>送信待ちのレシート</Text>
        </Press>
      ))}
      {local.jobs.map((j) => (
        <View key={j} style={[styles.srow, rowBorder]}>
          <Loader />
          <Text style={[styles.ttl, { color: t.ink, flex: 1 }]}>レシート処理中</Text>
        </View>
      ))}
      {local.manual.map(({ payload, needsCategory }) => {
        const busy = local.busy.includes(payload.mid);
        const status = busy ? '登録中' : needsCategory ? '要確認' : '送信待ち';
        const body = (
          <>
            {busy ? <Loader /> : <Clock size={19} color={t.fresh} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.ttl, { color: t.ink }]} numberOfLines={1}>
                {payload.name || '手入力'}
              </Text>
              <Text style={[styles.sub, { color: t.ink2 }]}>{status}</Text>
            </View>
            <Text style={[styles.amt, { color: t.ink }]}>
              {signed(payload.income ? payload.amount : -payload.amount)}
            </Text>
          </>
        );
        return busy ? (
          <View key={payload.mid} style={[styles.srow, rowBorder]}>
            {body}
          </View>
        ) : (
          <Press
            key={payload.mid}
            style={[styles.srow, rowBorder]}
            onPress={() =>
              needsCategory ? openCategorySheet(payload) : void sendManual({ payload, needsCategory }, true)
            }
          >
            {body}
          </Press>
        );
      })}

      {pendingJobs.map((j) => (
        <Press key={j.id} style={[styles.srow, rowBorder]} onPress={() => void openReview(j.id)}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.ttl, { color: t.ink }]} numberOfLines={1}>
              {j.store || 'レシート'}
            </Text>
            <Text style={[styles.sub, { color: t.ink2 }]}>{j.date || ''}</Text>
          </View>
          {j.total != null ? <Text style={[styles.amt, { color: t.ink }]}>−{fmt(j.total)}</Text> : null}
          <Text style={[styles.badge, { color: t.fresh, borderColor: t.fresh }]}>要確認</Text>
        </Press>
      ))}

      {data ? (
        <>
          <DayBars ym={month} byDay={byDay} selectedDay={day} onPick={pickDay} />
          <View style={{ height: 10 }} />
          <CatBand byCat={byCat} />
          <Calendar ym={month} byDay={byDay} selectedDay={day} onPick={pickDay} />
        </>
      ) : null}
      {day ? (
        <View style={styles.dayFilter}>
          <Text style={{ color: t.ink, fontSize: 13 }}>
            {Number(day.slice(5, 7))}/{Number(day.slice(8, 10))} の明細
          </Text>
          <Press
            mode="dim"
            style={[styles.clear, { borderColor: t.glassBrd, backgroundColor: t.field }]}
            onPress={() => kkView.set({ day: '' })}
          >
            <Text style={{ color: t.ink, fontSize: 12 }}>全日を表示</Text>
          </Press>
        </View>
      ) : null}
    </View>
  );

  return (
    <ScreenShell title="家計簿" right={nav}>
      <FlashList
        ref={listRef}
        data={items}
        keyExtractor={(i) => i.key}
        getItemType={(i) => i.t}
        ListHeaderComponent={header}
        ListEmptyComponent={
          entriesQ.isError ? (
            <Text style={[styles.empty, { color: t.ink2 }]}>
              読み込めませんでした（{(entriesQ.error as Error).message}）
            </Text>
          ) : (
            <View style={{ padding: 26, alignItems: 'flex-start' }}>
              <Loader />
            </View>
          )
        }
        contentContainerStyle={{ paddingTop: insets.top + HEADER_H, paddingBottom: BAR_H + insets.bottom + 48 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={insets.top + HEADER_H}
            tintColor={t.ink2}
          />
        }
        renderItem={({ item }) => {
          if (item.t === 'sec') {
            return <Text style={[styles.sec, { color: t.ink2 }]}>{item.label}</Text>;
          }
          if (item.t === 'empty') {
            return <Text style={[styles.empty, { color: t.ink2 }]}>{item.text}</Text>;
          }
          const r = item.e;
          const name = r.name || r.category || '（内容なし）';
          const sub = [r.category && r.name ? r.category : '', r.source].filter(Boolean).join(' · ');
          return (
            <SwipeRow onPress={() => openEdit(r)} onDelete={() => void deleteEntry(r.id)}>
              <View style={[styles.srow, rowBorder]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.ttl, { color: t.ink }]} numberOfLines={1}>
                    {name}
                  </Text>
                  {sub ? (
                    <Text style={[styles.sub, { color: t.ink2, fontFamily: undefined }]} numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.amt, { color: t.ink }]}>{signed(r.amount)}</Text>
              </View>
            </SwipeRow>
          );
        }}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nbtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mtitle: { fontSize: 15, fontWeight: '700', minWidth: 86, textAlign: 'center' },
  thisM: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sumbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  tot: { fontFamily: MONO, fontSize: 19 },
  bd: { fontFamily: MONO, fontSize: 11.5, textAlign: 'right' },
  actrow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  abtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    overflow: 'hidden',
  },
  srow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ttl: { fontSize: 15 },
  sub: { fontSize: 11.5, marginTop: 2, fontFamily: MONO },
  amt: { fontFamily: MONO, fontSize: 14.5 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, fontSize: 11 },
  sec: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4, fontSize: 12, letterSpacing: 0.6 },
  empty: { padding: 26, fontSize: 13.5 },
  dayFilter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  clear: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
});
