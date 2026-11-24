import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { PRESS_DARK, PRESS_LIGHT, useTheme } from '@/theme';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  // 'bg'：面（行など）を押している間だけ暗く。'dim'：ボタンを少し薄く。
  mode?: 'bg' | 'dim';
};

// iOS 流の押下ハイライト。波紋（リップル）は使わない。
export function Press({ style, children, mode = 'bg', ...rest }: Props) {
  const t = useTheme();
  return (
    <Pressable
      android_ripple={undefined}
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && mode === 'bg' && { backgroundColor: t.dark ? PRESS_DARK : PRESS_LIGHT },
        pressed && mode === 'dim' && { opacity: 0.55 },
      ]}
    >
      {children}
    </Pressable>
  );
}
