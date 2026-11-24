import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { BG_BLUR, BG_OPACITY, BG_PAPER_OVERLAY, useTheme } from '@/theme';

export function Background() {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.paper }]}>
      <Image
        source={require('../../assets/bg.jpg')}
        contentFit="cover"
        blurRadius={BG_BLUR}
        style={[StyleSheet.absoluteFill, { opacity: BG_OPACITY }]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: t.paper, opacity: BG_PAPER_OVERLAY },
        ]}
      />
    </View>
  );
}
