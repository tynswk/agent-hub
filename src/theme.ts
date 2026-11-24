import { useColorScheme } from 'react-native';

// dots-pwa-shared/tokens.css の値。アクセントは fresh（琥珀）1色だけ。
export const lightTheme = {
  paper: '#ffffff',
  paper2: '#f3f4f6',
  ink: '#1f2328',
  ink2: '#646b75',
  line: '#e4e6ea',
  fresh: '#b8760f',
  glass: 'rgba(255,255,255,0.72)',
  glass2: 'rgba(243,244,246,0.55)',
  glassBrd: 'rgba(31,35,40,0.1)',
  field: 'rgba(31,35,40,0.05)',
  red: '#e5484d',
  green: '#34b759',
  blurTint: 'systemUltraThinMaterialLight' as const,
  pillOn: 'rgba(31,35,40,0.09)',
  tabGlassRgb: '255,255,255',
};

export const darkTheme = {
  paper: '#000000',
  paper2: '#16171a',
  ink: '#ececee',
  ink2: '#93979f',
  line: '#232428',
  fresh: '#e3a23f',
  glass: 'rgba(16,17,20,0.55)',
  glass2: 'rgba(22,23,26,0.5)',
  glassBrd: 'rgba(255,255,255,0.1)',
  field: 'rgba(255,255,255,0.06)',
  red: '#e5484d',
  green: '#34b759',
  blurTint: 'systemUltraThinMaterialDark' as const,
  pillOn: 'rgba(255,255,255,0.16)',
  tabGlassRgb: '16,17,20',
};

export type Theme = typeof lightTheme | typeof darkTheme;

export function useTheme(): Theme & { dark: boolean } {
  const dark = useColorScheme() !== 'light';
  return { ...(dark ? darkTheme : lightTheme), dark };
}

// 下部ピルバーの濃さ。0（完全に透明）〜1。ここ1つで変える。
export const TAB_GLASS_ALPHA = 0.18;
export const TAB_BLUR_INTENSITY = 70;

// 背景画像（PWA と同じ）
export const BG_OPACITY = 0.53;
export const BG_BLUR = 4;
export const BG_PAPER_OVERLAY = 0.48;

export const BAR_H = 58;
export const HEADER_H = 48;
