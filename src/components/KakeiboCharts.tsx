import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Press } from '@/components/Press';
import { type Entry, PALETTE, fmt, todayStr } from '@/lib/kakeibo';
import { MONO, useTheme } from '@/theme';

export type DayAgg = Record<string, { exp: number; inc: number }>;

export function aggregate(entries: Entry[]) {
  const byDay: DayAgg = {};
  const byCat: Record<string, number> = {};
  for (const r of entries) {
    const e = byDay[r.date] || (byDay[r.date] = { exp: 0, inc: 0 });
    if (r.amount < 0) {
      e.exp += -r.amount;
      const c = r.category || '未分類';
      byCat[c] = (byCat[c] || 0) + -r.amount;
    } else e.inc += r.amount;
  }
  return { byDay, byCat };
}

const BAR_AREA = 52;

function Bar({
  height,
  day,
  today,
  selected,
  showLabel,
  onPress,
}: {
  height: number;
  day: number;
  today: boolean;
  selected: boolean;
  showLabel: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withTiming(height, { duration: 380, easing: Easing.out(Easing.cubic) });
  }, [height, h]);
  const fill = useAnimatedStyle(() => ({ height: h.value }));
  const hot = today || selected;
  return (
    <Press mode="dim" onPress={onPress} style={styles.barCol}>
      <Animated.View
        style={[
          styles.barFill,
          fill,
          {
            backgroundColor: hot ? t.fresh : t.ink2,
            opacity: hot ? 1 : 0.45,
            borderWidth: selected ? 1 : 0,
            borderColor: t.fresh,
          },
        ]}
      />
      <Text style={[styles.barDay, { color: t.ink2, opacity: showLabel ? 1 : 0 }]}>{day}</Text>
    </Press>
  );
}

// 日別支出バー。タップでその日に絞る。
export function DayBars({
  ym,
  byDay,
  selectedDay,
  onPick,
}: {
  ym: string;
  byDay: DayAgg;
  selectedDay: string;
  onPick: (key: string) => void;
}) {
  const [vy, vm] = ym.split('-').map(Number);
  const days = new Date(vy, vm, 0).getDate();
  const prefix = `${vy}/${String(vm).padStart(2, '0')}/`;
  const max = Math.max(1, ...Object.values(byDay).map((x) => x.exp));
  const today = todayStr();
  return (
    <View style={styles.bars}>
      {Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const key = prefix + String(day).padStart(2, '0');
        const exp = byDay[key]?.exp || 0;
        const h = exp ? Math.max(4, Math.round((exp / max) * BAR_AREA)) : 2;
        return (
          <Bar
            key={`${ym}-${day}`}
            height={h}
            day={day}
            today={key.replaceAll('/', '-') === today}
            selected={selectedDay === key}
            showLabel={i % 3 !== 1}
            onPress={() => onPick(key)}
          />
        );
      })}
    </View>
  );
}

// カテゴリ割合：100% 積み上げの帯＋凡例（上位6＋その他）
export function CatBand({ byCat }: { byCat: Record<string, number> }) {
  const t = useTheme();
  let rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (rows.length > 7) {
    const rest = rows.slice(6).reduce((s, x) => s + x[1], 0);
    rows = [...rows.slice(0, 6), ['その他', rest]];
  }
  const total = rows.reduce((s, x) => s + x[1], 0);
  if (!rows.length || total <= 0) return null;
  return (
    <View>
      <View style={[styles.band, { backgroundColor: t.field }]}>
        {rows.map(([name, amt], i) => (
          <View key={name} style={{ flex: amt, backgroundColor: PALETTE[i % PALETTE.length], minWidth: 2 }} />
        ))}
      </View>
      {rows.map(([name, amt], i) => (
        <View key={name} style={styles.catRow}>
          <View style={[styles.dot, { backgroundColor: PALETTE[i % PALETTE.length] }]} />
          <Text style={[styles.catName, { color: t.ink }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.catPct, { color: t.ink2 }]}>{Math.round((amt / total) * 100)}%</Text>
          <Text style={[styles.catAmt, { color: t.ink }]}>−{fmt(amt)}</Text>
        </View>
      ))}
    </View>
  );
}

// 日別カレンダー（タップで絞る）。日マスは均等幅・高さ固定。
export function Calendar({
  ym,
  byDay,
  selectedDay,
  onPick,
}: {
  ym: string;
  byDay: DayAgg;
  selectedDay: string;
  onPick: (key: string) => void;
}) {
  const t = useTheme();
  const [vy, vm] = ym.split('-').map(Number);
  const days = new Date(vy, vm, 0).getDate();
  const first = new Date(vy, vm - 1, 1).getDay();
  const prefix = `${vy}/${String(vm).padStart(2, '0')}/`;
  const today = todayStr();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return (
    <View style={styles.cal}>
      <View style={styles.calRow}>
        {['日', '月', '火', '水', '木', '金', '土'].map((w) => (
          <Text key={w} style={[styles.calH, { color: t.ink2 }]}>
            {w}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={styles.calRow}>
          {r.map((day, ci) => {
            if (!day) return <View key={ci} style={styles.calCell} />;
            const key = prefix + String(day).padStart(2, '0');
            const e = byDay[key];
            const sel = selectedDay === key;
            const isToday = key.replaceAll('/', '-') === today;
            return (
              <View key={ci} style={styles.calCell}>
                <Press
                  mode="dim"
                  onPress={() => onPick(key)}
                  style={[
                    styles.calFill,
                    {
                      backgroundColor: t.field,
                      borderColor: sel ? t.fresh : isToday ? t.glassBrd : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.calD, { color: t.ink }]}>{day}</Text>
                  {e && e.exp ? (
                    <Text style={[styles.calA, { color: t.ink }]} numberOfLines={1}>
                      −{fmt(e.exp)}
                    </Text>
                  ) : null}
                  {e && e.inc ? (
                    <Text style={[styles.calA, { color: t.green }]} numberOfLines={1}>
                      +{fmt(e.inc)}
                    </Text>
                  ) : null}
                </Press>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingHorizontal: 16, paddingTop: 14, height: 90 },
  barCol: { flex: 1, minWidth: 0, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  barFill: { width: '70%', maxWidth: 16, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barDay: { fontSize: 8.5, marginTop: 3, fontFamily: MONO },
  band: { flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', marginHorizontal: 16, marginTop: 4, marginBottom: 8 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 16, paddingVertical: 5 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  catName: { flex: 1, fontSize: 12.5 },
  catPct: { width: 40, textAlign: 'right', fontSize: 12.5, fontFamily: MONO },
  catAmt: { fontSize: 12.5, fontFamily: MONO },
  cal: { paddingHorizontal: 12, paddingTop: 8, gap: 3 },
  calRow: { flexDirection: 'row', gap: 3 },
  calH: { flex: 1, textAlign: 'center', fontSize: 10.5, paddingVertical: 2 },
  calCell: { flex: 1, flexBasis: 0, minWidth: 0, height: 62 },
  calFill: { flex: 1, borderRadius: 9, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 4, overflow: 'hidden' },
  calD: { fontSize: 12, fontFamily: MONO },
  calA: { fontSize: 8.5, fontFamily: MONO, marginTop: 2 },
});
