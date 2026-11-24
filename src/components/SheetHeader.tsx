import { Check, X } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Loader } from '@/components/Loader';
import { Press } from '@/components/Press';
import { useTheme } from '@/theme';

// シートのヘッダ：× と ✓ だけ
export function SheetHeader({
  title,
  onClose,
  onOk,
  busy,
}: {
  title: string;
  onClose: () => void;
  onOk?: () => void;
  busy?: boolean;
}) {
  const t = useTheme();
  // Android は通常のモーダル（全面）なので、ステータスバーの分を空ける。iOS の formSheet は不要。
  const top = Platform.OS === 'android' ? useSafeAreaInsets().top : 0;
  return (
    <View style={[styles.row, { borderBottomColor: t.line, paddingTop: top, height: 52 + top }]}>
      <Press mode="dim" onPress={onClose} style={styles.btn} accessibilityLabel="閉じる">
        <X size={21} color={t.ink} strokeWidth={2} />
      </Press>
      <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
      {onOk ? (
        <Press mode="dim" onPress={onOk} disabled={busy} style={styles.btn} accessibilityLabel="確定">
          {busy ? <Loader size={20} color={t.fresh} /> : <Check size={22} color={t.fresh} strokeWidth={2.4} />}
        </Press>
      ) : (
        <View style={styles.btn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
});
