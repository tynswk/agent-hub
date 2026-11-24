'use no memo';
// 等幅の生表示。大きなテキストでも重くならないよう、行をまとめて FlashList に載せる
import { FlashList } from '@shopify/flash-list';
import { useMemo } from 'react';
import { Text } from 'react-native';
import { MONO, useTheme } from '@/theme';

const PER = 40;

export function RawText({ text, bottom }: { text: string; bottom: number }) {
  const t = useTheme();
  const parts = useMemo(() => {
    const lines = text.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += PER) out.push(lines.slice(i, i + PER).join('\n'));
    return out.length ? out : [''];
  }, [text]);
  return (
    <FlashList
      data={parts}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item }) => (
        <Text selectable style={{ color: t.ink, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>
          {item}
        </Text>
      )}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottom }}
    />
  );
}
