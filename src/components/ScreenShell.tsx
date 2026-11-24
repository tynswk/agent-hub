import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HEADER_H, useTheme } from '@/theme';

export function ScreenShell({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <View style={styles.flex}>{children}</View>
      <View
        style={[
          styles.header,
          { height: insets.top + HEADER_H, borderBottomColor: t.glassBrd },
        ]}
      >
        <BlurView intensity={60} tint={t.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.glass2 }]} />
        <View style={[styles.titleRow, { paddingTop: insets.top }]}>
          <Text style={[styles.title, { color: t.ink }]}>{title}</Text>
          {right}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  title: { fontSize: 20, fontWeight: '700' },
});
