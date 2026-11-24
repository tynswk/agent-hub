import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LimitRing } from '@/components/LimitRing';
import { SheetHeader } from '@/components/SheetHeader';
import { useDiscardGuard } from '@/lib/discard';
import { LIMITS_META, fmtReset, limSheet, useLimits } from '@/lib/sessions';
import { useTheme } from '@/theme';

// AI 上限の詳細：大きな円・残り %・リセット日時
export default function LimitSheet() {
  const t = useTheme();
  const { id } = limSheet.useStore();
  const q = useLimits();
  const { close } = useDiscardGuard(false);
  const m = LIMITS_META.find((x) => x.id === id) ?? LIMITS_META[0];
  const d = q.data?.[m.id];
  const v = d?.remain ?? null;
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SheetHeader title={m.name + (m.sub ? `（${m.sub}）` : '')} onClose={close} />
      <View style={styles.body}>
        <View>
          <LimitRing value={v} size={92} stroke={8} font={24} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.ink, fontSize: 14 }}>
            <Text style={{ color: t.ink2 }}>残り　</Text>
            {v === null ? '—' : `${v}%`}
          </Text>
          <Text style={{ color: t.ink, fontSize: 14 }}>
            <Text style={{ color: t.ink2 }}>リセット　</Text>
            {fmtReset(d?.reset)}
          </Text>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 22, padding: 22 },
});
