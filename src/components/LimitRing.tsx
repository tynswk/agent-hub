import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';

// 残り % の円。20% 以下は琥珀、0% は赤、取れない枠（null）は輪だけ。
export function LimitRing({ value, size, stroke, font }: { value: number | null; size: number; stroke: number; font: number }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = value === null ? t.field : value <= 0 ? t.red : value <= 20 ? t.fresh : t.green;
  const depleted = value === 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.field} strokeWidth={stroke} />
        {value !== null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={col}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text
          style={{
            fontSize: font,
            fontWeight: '700',
            color: depleted ? (t.dark ? '#ff939b' : '#9f2631') : t.ink,
          }}
        >
          {value === null ? '—' : value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
