// Drive の行まわりの小部品：名前（途中を省略して拡張子を残す）・種別アイコン
import {
  File as FileIcon,
  FileCode,
  FileText,
  Film,
  Globe,
  Image as ImageIcon,
  Music,
  Presentation,
} from 'lucide-react-native';
import { type StyleProp, Text, type TextStyle, View } from 'react-native';
import type { DFile } from '@/lib/drive/api';
import { type Kind, kindOf, splitName } from '@/lib/drive/util';

// 長い名前は途中を「…」にして、拡張子は必ず見せる
export function FileName({
  name,
  folder,
  style,
}: {
  name: string;
  folder?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const [stem, ext] = splitName(name, folder);
  return (
    <View style={{ flexDirection: 'row', flexShrink: 1, minWidth: 0 }}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={[style, { flexShrink: 1 }]}>
        {stem}
      </Text>
      {ext ? (
        <Text numberOfLines={1} style={[style, { flexShrink: 0 }]}>
          {ext}
        </Text>
      ) : null}
    </View>
  );
}

const ICONS: Record<Kind, typeof FileIcon> = {
  md: FileText,
  code: FileCode,
  video: Film,
  audio: Music,
  image: ImageIcon,
  pdf: Presentation,
  html: Globe,
  other: FileIcon,
};
export function KindIcon({ file, size = 20, color }: { file: Pick<DFile, 'name' | 'mimeType' | 'size'>; size?: number; color: string }) {
  const I = ICONS[kindOf(file)];
  return <I size={size} color={color} strokeWidth={1.9} />;
}
export const kindIcon = (k: Kind) => ICONS[k];
