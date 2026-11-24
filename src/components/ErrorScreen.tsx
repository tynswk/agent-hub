// 起動時などの致命的エラーを、アプリを落とさず画面に出す（本人がメッセージを送れるように）。
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}\n\n${e.stack ?? ''}`;
  try {
    return String(e);
  } catch {
    return '不明なエラー';
  }
}

export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = errorText(error);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>エラーが起きました</Text>
      <ScrollView style={styles.box}>
        <Text selectable style={styles.mono}>
          {text}
        </Text>
      </ScrollView>
      <View style={styles.row}>
        <Pressable
          style={styles.btn}
          onPress={() => {
            void Clipboard.setStringAsync(text).then(() => setCopied(true));
          }}
        >
          <Text style={styles.btnText}>{copied ? 'コピーしました' : 'コピー'}</Text>
        </Pressable>
        {onRetry ? (
          <Pressable style={styles.btn} onPress={onRetry}>
            <Text style={styles.btnText}>再試行</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingTop: 70, paddingHorizontal: 18, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  box: { flex: 1, backgroundColor: '#1c1c1e', borderRadius: 12, padding: 12 },
  mono: { color: '#f2f2f7', fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 12, marginTop: 14 },
  btn: { flex: 1, backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
