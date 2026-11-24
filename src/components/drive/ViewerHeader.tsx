'use no memo';
import * as Clipboard from 'expo-clipboard';
import { Check, Ellipsis, Pencil, X } from 'lucide-react-native';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileName } from '@/components/drive/parts';
import { GlassMenu } from '@/components/GlassMenu';
import { Loader } from '@/components/Loader';
import { Press } from '@/components/Press';
import { toast } from '@/components/Toast';
import { type DFile, fullPath } from '@/lib/drive/api';
import { useTheme } from '@/theme';

export type EditCtl = {
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export function ViewerHeader({ file, onClose, edit }: { file: DFile; onClose: () => void; edit?: EditCtl }) {
  const t = useTheme();
  // Android は通常のモーダル（全面）なので、ステータスバーの分を空ける。iOS の formSheet は不要。
  const top = Platform.OS === 'android' ? useSafeAreaInsets().top : 0;

  const copyPath = async () => {
    try {
      await Clipboard.setStringAsync(await fullPath(file));
      toast('フルパスをコピーしました');
    } catch {
      toast('コピーできませんでした');
    }
  };
  const copyLink = async () => {
    try {
      const p = (await fullPath(file)).split('/').slice(1).join('/');
      await Clipboard.setStringAsync(`agenthub://drive?path=${encodeURIComponent(p)}`);
      toast('リンクをコピーしました');
    } catch {
      toast('コピーできませんでした');
    }
  };

  return (
    <View style={[styles.row, { borderBottomColor: t.line, paddingTop: top, height: 52 + top }]}>
      <Press mode="dim" onPress={onClose} style={styles.btn} accessibilityLabel="閉じる">
        <X size={21} color={t.ink} strokeWidth={2} />
      </Press>
      <View style={styles.title}>
        <FileName name={file.name} style={{ color: t.ink, fontSize: 16, fontWeight: '700' }} />
      </View>
      {edit?.editing ? (
        <Press mode="dim" onPress={edit.onCancel} style={styles.btn} accessibilityLabel="編集をやめる">
          <X size={20} color={t.ink2} strokeWidth={2} />
        </Press>
      ) : null}
      {edit ? (
        edit.editing ? (
          <Press mode="dim" onPress={edit.onSave} disabled={edit.busy} style={styles.btn} accessibilityLabel="保存">
            {edit.busy ? <Loader size={20} color={t.fresh} /> : <Check size={22} color={t.fresh} strokeWidth={2.4} />}
          </Press>
        ) : (
          <Press mode="dim" onPress={edit.onEdit} style={styles.btn} accessibilityLabel="編集">
            <Pencil size={19} color={t.ink} strokeWidth={2} />
          </Press>
        )
      ) : null}
      <GlassMenu
        width={230}
        items={[
          { key: 'path', label: 'フルパスをコピー', onSelect: () => void copyPath() },
          { key: 'link', label: 'リンクをコピー', onSelect: () => void copyLink() },
          {
            key: 'drive',
            label: 'Driveで開く',
            onSelect: () => void Linking.openURL(`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`),
          },
        ]}
      >
        {(open) => (
          <Press mode="dim" onPress={open} style={styles.btn} accessibilityLabel="その他">
            <Ellipsis size={22} color={t.ink} />
          </Press>
        )}
      </GlassMenu>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, paddingHorizontal: 6, flexDirection: 'row' },
});
