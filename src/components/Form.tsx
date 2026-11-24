import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Press } from '@/components/Press';
import { type Cat, dateStr, parseDate } from '@/lib/kakeibo';
import { MONO, useTheme } from '@/theme';

export function Field({ label, children, column }: { label?: string; children: ReactNode; column?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.frow,
        { borderBottomColor: t.glassBrd },
        column && { flexDirection: 'column', alignItems: 'stretch', gap: 7 },
      ]}
    >
      {label ? <Text style={[styles.label, { color: t.ink2 }]}>{label}</Text> : null}
      {children}
    </View>
  );
}

// 日付（YYYY-MM-DD）。iOS は標準のコンパクトな日付ピッカー、Android は標準ダイアログ。
export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const d = parseDate(value);
  if (Platform.OS === 'ios') {
    return (
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <DateTimePicker
          value={d}
          mode="date"
          display="compact"
          themeVariant={t.dark ? 'dark' : 'light'}
          locale="ja-JP"
          onChange={(_, v) => v && onChange(dateStr(v))}
        />
      </View>
    );
  }
  return (
    <Press
      mode="dim"
      style={[styles.dateBtn, { backgroundColor: t.field, borderColor: t.glassBrd }]}
      onPress={() =>
        DateTimePickerAndroid.open({
          value: d,
          mode: 'date',
          onValueChange: (_, v) => onChange(dateStr(v)),
        })
      }
    >
      <Text style={{ color: t.ink, fontFamily: MONO, fontSize: 15 }}>{value.replaceAll('-', '/')}</Text>
    </Press>
  );
}

// カテゴリのチップ。empty を渡すと先頭に「未分類」（ID が空）を足す。
export function CatChips({
  cats,
  picked,
  onPick,
  empty,
}: {
  cats: Cat[];
  picked: string;
  onPick: (id: string) => void;
  empty?: boolean;
}) {
  const t = useTheme();
  const list = empty ? [{ id: '', name: '未分類' } as Cat, ...cats] : cats;
  return (
    <View style={styles.chips}>
      {list.map((c) => {
        const on = picked === c.id;
        return (
          <Press
            key={c.id || 'none'}
            mode="dim"
            onPress={() => onPick(c.id)}
            style={[
              styles.chip,
              { backgroundColor: t.field, borderColor: on ? t.fresh : t.glassBrd },
            ]}
          >
            <Text style={{ color: on ? t.fresh : t.ink, fontSize: 13 }}>{c.name}</Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { width: 76, fontSize: 13.5 },
  dateBtn: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, flex: 1 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
});
