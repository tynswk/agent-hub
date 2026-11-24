'use no memo';
import Markdown, { Renderer } from 'react-native-marked';
import { type ReactNode, useMemo } from 'react';
import { Linking, Text, type TextStyle } from 'react-native';
import { toast } from '@/components/Toast';
import { MONO, useTheme } from '@/theme';

const REL = 'dvrel:/';
const isRel = (href: string) => !/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(href);

// リンクは自前で処理：外部URLは端末のブラウザ、相対パスはアプリ内でそのファイルを開く（ADR-0019）
class DriveRenderer extends Renderer {
  private onRel: (href: string) => void;
  private n = 0;
  constructor(onRel: (href: string) => void) {
    super({ selectable: true });
    this.onRel = onRel;
  }
  link(children: string | ReactNode[], href: string, styles?: TextStyle): ReactNode {
    return (
      <Text
        key={`dl${this.n++}`}
        accessibilityRole="link"
        style={styles}
        onPress={() => {
          // 相対リンクは baseUrl に REL を付けて渡してあるので、外して判定する（ライブラリが先頭に / を足すため）
          if (href.startsWith(REL)) {
            const rel = href.slice(REL.length);
            if (rel.startsWith('#') || !isRel(rel)) return;
            this.onRel(rel);
          } else Linking.openURL(href).catch(() => toast('開けませんでした'));
        }}
      >
        {children}
      </Text>
    );
  }
}

export function MdView({
  text,
  onRelLink,
  bottom,
}: {
  text: string;
  onRelLink: (href: string) => void;
  bottom: number;
}) {
  const t = useTheme();
  const renderer = useMemo(() => new DriveRenderer(onRelLink), [onRelLink]);
  return (
    <Markdown
      value={text}
      renderer={renderer}
      baseUrl="dvrel:"
      theme={{ colors: { code: t.paper2, link: t.fresh, text: t.ink, border: t.line } }}
      styles={{
        text: { color: t.ink, fontSize: 16, lineHeight: 25 },
        codespan: { fontFamily: MONO, fontSize: 14, fontStyle: 'normal', backgroundColor: t.field, color: t.ink },
        code: { backgroundColor: t.field, borderRadius: 8, padding: 12 },
        codeText: { fontFamily: MONO, fontSize: 13.5, fontStyle: 'normal', color: t.ink },
        blockquote: { borderLeftColor: t.fresh, borderLeftWidth: 3, paddingLeft: 10 },
        link: { color: t.fresh, fontStyle: 'normal', textDecorationLine: 'underline' },
        tableCell: { padding: 8 },
      }}
      flatListProps={{
        style: { flex: 1 },
        contentContainerStyle: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: bottom },
        keyboardShouldPersistTaps: 'handled',
      }}
    />
  );
}

export { isRel };
