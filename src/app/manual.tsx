import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CatChips, DateField, Field } from '@/components/Form';
import { PillSegment } from '@/components/PillSegment';
import { SheetHeader } from '@/components/SheetHeader';
import { toast } from '@/components/Toast';
import { apiPost } from '@/lib/api';
import { useDiscardGuard } from '@/lib/discard';
import {
  type EntriesRes,
  type Entry,
  type ManualPayload,
  kkSheet,
  kkView,
  newMid,
  reloadEntries,
  todayStr,
  useCats,
} from '@/lib/kakeibo';
import { queryClient } from '@/lib/queryClient';
import { saveManual, sendManual } from '@/lib/local';
import { MONO, useTheme } from '@/theme';

type Io = 'out' | 'in';

async function sendEdit(id: string, payload: Record<string, unknown>) {
  try {
    const d = await apiPost<{ ok?: boolean; message?: string }>(
      `/api/kakeibo/entries/${encodeURIComponent(id)}/update`,
      payload,
    );
    if (d.ok) {
      toast('変更しました');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void reloadEntries();
    } else toast(d.message || '変更できませんでした');
  } catch {
    toast('変更できませんでした');
  }
}

export default function ManualSheet() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const catsQ = useCats();
  const [ctx] = useState(() => kkSheet.get().ctx);

  const init = (() => {
    if (ctx.mode === 'edit') {
      const r = ctx.entry;
      return {
        io: (r.amount >= 0 ? 'in' : 'out') as Io,
        amount: String(Math.abs(r.amount)),
        name: r.name || '',
        date: (r.date || '').replaceAll('/', '-'),
        auto: !r.category_id,
        picked: r.category_id || '',
      };
    }
    if (ctx.mode === 'category') {
      const p = ctx.payload;
      return {
        io: (p.income ? 'in' : 'out') as Io,
        amount: String(p.amount),
        name: p.name,
        date: p.date,
        auto: false,
        picked: '',
      };
    }
    return { io: 'out' as Io, amount: '', name: '', date: todayStr(), auto: true, picked: '' };
  })();
  const initRef = useRef(init);

  const [io, setIo] = useState<Io>(init.io);
  const [amount, setAmount] = useState(init.amount);
  const [name, setName] = useState(init.name);
  const [date, setDate] = useState(init.date);
  const [auto, setAuto] = useState(init.auto);
  const [picked, setPicked] = useState(init.picked);

  const dirty =
    io !== initRef.current.io ||
    amount !== initRef.current.amount ||
    name !== initRef.current.name ||
    date !== initRef.current.date ||
    auto !== initRef.current.auto ||
    picked !== initRef.current.picked;
  const { close, leave } = useDiscardGuard(dirty);
  const catList = (io === 'in' ? catsQ.data?.income : catsQ.data?.expense) ?? [];

  const save = () => {
    const amt = parseInt(amount, 10);
    if (!(amt > 0)) {
      toast('金額を入れてください');
      return;
    }
    const income = io === 'in';
    if (ctx.mode === 'edit') {
      const e: Entry = ctx.entry;
      const sameKind = income === (e.amount >= 0);
      let category = sameKind ? 'keep' : '';
      if (auto && e.category_id) category = '';
      if (!auto && picked && catList.some((c) => c.id === picked) && (!sameKind || picked !== e.category_id)) {
        category = picked;
      }
      const payload: Record<string, unknown> = { date, name: name.trim(), amount: amt, income, category };
      const cached = queryClient.getQueryData<EntriesRes>(['kk', 'entries', kkView.get().month]);
      // 旧 API との接続中は、保持したい明細を明示的に渡す。
      if (!cached?.edit_preserves_detail) payload.detail = e.detail ?? '';
      leave();
      void sendEdit(e.id, payload);
      return;
    }
    if (ctx.mode === 'category' && !auto && !picked) {
      toast('カテゴリーを選んでください');
      return;
    }
    const payload: ManualPayload = {
      date,
      name: name.trim(),
      detail: '',
      amount: amt,
      income,
      category: auto ? 'auto' : picked || 'auto',
      mid: ctx.mode === 'category' ? ctx.payload.mid : newMid(),
    };
    const rec = { payload, needsCategory: false };
    saveManual(rec)
      .then(() => {
        leave(); // ✓ で即閉じる。登録は一覧の「登録中」行で進める
        void sendManual(rec, true);
      })
      .catch(() => toast('入力を端末に保存できませんでした'));
  };

  const title = ctx.mode === 'edit' ? '編集' : ctx.mode === 'category' ? 'カテゴリー確認' : '手入力';
  const input = [styles.inp, { backgroundColor: t.field, borderColor: t.glassBrd, color: t.ink }];

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SheetHeader title={title} onClose={close} onOk={save} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View style={styles.seg}>
          <PillSegment
            options={[
              { key: 'out', label: '支出' },
              { key: 'in', label: '収入' },
            ]}
            value={io}
            onChange={(k) => {
              setIo(k);
              setPicked('');
            }}
          />
        </View>
        <Field label="金額">
          <TextInput
            style={[...input, { fontFamily: MONO }]}
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            autoComplete="off"
          />
        </Field>
        <Field label="内容">
          <TextInput style={input} value={name} onChangeText={setName} autoComplete="off" />
        </Field>
        <Field label="カテゴリ">
          <View style={styles.autoRow}>
            <Text style={{ fontSize: 13, color: t.ink2 }}>自動</Text>
            <Switch
              value={auto}
              onValueChange={(v) => {
                setAuto(v);
              }}
              trackColor={{ true: t.green, false: t.field }}
              ios_backgroundColor={t.field}
              thumbColor="#ffffff"
            />
          </View>
        </Field>
        {!auto ? (
          <Field>
            <CatChips cats={catList} picked={picked} onPick={setPicked} />
          </Field>
        ) : null}
        <Field label="日付">
          <DateField value={date} onChange={setDate} />
        </Field>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  seg: { alignItems: 'center', paddingVertical: 14 },
  inp: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  autoRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
});
