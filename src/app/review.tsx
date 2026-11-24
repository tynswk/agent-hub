import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CatChips, DateField, Field } from '@/components/Form';
import { SheetHeader } from '@/components/SheetHeader';
import { toast } from '@/components/Toast';
import { apiPost } from '@/lib/api';
import { useDiscardGuard } from '@/lib/discard';
import { kkSheet, reloadEntries, reloadPending, useCats } from '@/lib/kakeibo';
import { MONO, useTheme } from '@/theme';

type G = { name: string; amount: string; category: string };

// 要確認のレシート：店名・日付・品目ごとの名前・金額・カテゴリ（チップ）を直して登録する
export default function ReviewSheet() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const catsQ = useCats();
  const [job] = useState(() => {
    const c = kkSheet.get().ctx;
    if (c.mode !== 'review') throw new Error('no job');
    return c.job;
  });
  const init = useRef({
    store: job.store || '',
    date: (job.date || '').replaceAll('/', '-'),
    groups: (job.groups || []).map((g) => ({
      name: g.name || '',
      amount: g.amount != null ? String(g.amount) : '',
      category: g.category || '',
    })),
  });
  const [store, setStore] = useState(init.current.store);
  const [date, setDate] = useState(init.current.date);
  const [groups, setGroups] = useState<G[]>(init.current.groups);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify({ store, date, groups }) !== JSON.stringify(init.current);
  const { close, leave } = useDiscardGuard(dirty);
  const patch = (i: number, p: Partial<G>) => setGroups((gs) => gs.map((g, k) => (k === i ? { ...g, ...p } : g)));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await apiPost<{ ok?: boolean; message?: string }>(`/api/kakeibo/receipts/${job.id}/confirm`, {
        date: date.replaceAll('-', '/'),
        store: store.trim(),
        groups: groups.map((g) => ({
          name: g.name.trim(),
          amount: parseInt(g.amount.replace(/[^0-9]/g, ''), 10) || 0,
          category: g.category,
          detail: '',
        })),
      });
      if (d.ok) {
        leave();
        toast('登録しました');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void reloadPending();
        void reloadEntries();
      } else toast(d.message || '登録できませんでした');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.inp, { backgroundColor: t.field, borderColor: t.glassBrd, color: t.ink }];
  const colInput = [...input, { flex: 0 }];
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SheetHeader title="レシート確認" onClose={close} onOk={save} busy={busy} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {(job.problems ?? []).map((p, i) => (
          <Text key={i} style={[styles.prob, { color: t.fresh }]}>
            {p}
          </Text>
        ))}
        <Field label="店名">
          <TextInput style={input} value={store} onChangeText={setStore} />
        </Field>
        <Field label="日付">
          <DateField value={date} onChange={setDate} />
        </Field>
        {groups.map((g, i) => (
          <Field key={i} column>
            <Text style={{ color: t.ink2, fontSize: 13.5 }}>品目 {i + 1}</Text>
            <TextInput style={colInput} value={g.name} onChangeText={(v) => patch(i, { name: v })} />
            <TextInput
              style={[...colInput, { fontFamily: MONO }]}
              value={g.amount}
              onChangeText={(v) => patch(i, { amount: v.replace(/[^0-9]/g, '') })}
              keyboardType="number-pad"
            />
            <View style={{ flexDirection: 'row' }}>
              <CatChips
                cats={catsQ.data?.expense ?? []}
                picked={g.category}
                onPick={(id) => patch(i, { category: id })}
                empty
              />
            </View>
          </Field>
        ))}
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inp: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  prob: { fontSize: 12.5, paddingHorizontal: 16, paddingVertical: 3 },
});
