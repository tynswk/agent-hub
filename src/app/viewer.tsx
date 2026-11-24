'use no memo';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImageBody, MediaBody, OpenInDrive, PdfBody } from '@/components/drive/Bodies';
import { DocViewer } from '@/components/drive/DocViewer';
import { ViewerHeader } from '@/components/drive/ViewerHeader';
import { Loader } from '@/components/Loader';
import { toast } from '@/components/Toast';
import { useDiscardGuard } from '@/lib/discard';
import { type DFile, getMeta, reg } from '@/lib/drive/api';
import { ago, fmtSize, freshness, kindOf } from '@/lib/drive/util';
import { useTheme } from '@/theme';

// 閉じる以外の操作がない種別（画像・PDF・動画・音声・その他）
function SimpleViewer({ file }: { file: DFile }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { close } = useDiscardGuard(false);
  const k = kindOf(file);
  const fr = freshness(file.t);
  return (
    <View style={{ flex: 1, backgroundColor: t.paper2 }}>
      <ViewerHeader file={file} onClose={close} />
      <View style={styles.sub}>
        <Text style={[styles.meta, { color: fr === 'fresh' ? t.fresh : t.ink2 }]} numberOfLines={1}>
          {ago(file.t)}に更新{file.size != null ? ` ・ ${fmtSize(file.size)}` : ''}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        {k === 'image' ? (
          <ImageBody file={file} bottom={insets.bottom} />
        ) : k === 'pdf' ? (
          <PdfBody file={file} />
        ) : k === 'video' || k === 'audio' ? (
          <MediaBody file={file} />
        ) : (
          <OpenInDrive file={file} />
        )}
      </View>
    </View>
  );
}

export default function ViewerRoute() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [file, setFile] = useState<DFile | null>(() => reg.get(String(id)) ?? null);
  useEffect(() => {
    if (file) return;
    getMeta(String(id))
      .then((f) => {
        reg.set(f.id, f);
        setFile(f);
      })
      .catch(() => toast('読み込めませんでした'));
  }, [id, file]);

  if (!file) {
    return (
      <View style={{ flex: 1, backgroundColor: t.paper2, padding: 26, alignItems: 'flex-start' }}>
        <Loader />
      </View>
    );
  }
  const k = kindOf(file);
  if (k === 'md' || k === 'code' || k === 'html') return <DocViewer file={file} kind={k} />;
  return <SimpleViewer file={file} />;
}

const styles = StyleSheet.create({
  sub: { paddingHorizontal: 16, paddingVertical: 8 },
  meta: { fontSize: 13 },
});
