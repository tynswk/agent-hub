import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Background } from '@/components/Background';
import { ToastHost } from '@/components/Toast';
import { initLocal } from '@/lib/local';
import { queryClient } from '@/lib/queryClient';
import { useTheme } from '@/theme';

// iOS は標準のシート（formSheet）。Android（Expo Go での確認用）は formSheet の中身が描画されないため通常のモーダルにする。
const SHEET_PRESENTATION = Platform.OS === 'ios' ? 'formSheet' : 'modal';

export default function RootLayout() {
  const t = useTheme();

  useEffect(() => {
    void initLocal();
  }, []);

  return (
    <GestureHandlerRootView style={[styles.flex, { backgroundColor: t.paper }]}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={t.dark ? 'light' : 'dark'} />
          <Background />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="manual"
              options={{
                presentation: SHEET_PRESENTATION,
                animation: Platform.OS === 'ios' ? undefined : 'slide_from_bottom',
                sheetAllowedDetents: [0.62, 0.95],
                sheetGrabberVisible: true,
                contentStyle: { backgroundColor: t.paper2 },
              }}
            />
            <Stack.Screen
              name="review"
              options={{
                presentation: SHEET_PRESENTATION,
                animation: Platform.OS === 'ios' ? undefined : 'slide_from_bottom',
                sheetAllowedDetents: [0.7, 0.95],
                sheetGrabberVisible: true,
                contentStyle: { backgroundColor: t.paper2 },
              }}
            />
            <Stack.Screen
              name="session-new"
              options={{
                presentation: SHEET_PRESENTATION,
                animation: Platform.OS === 'ios' ? undefined : 'slide_from_bottom',
                sheetAllowedDetents: [0.7, 0.95],
                sheetGrabberVisible: true,
                contentStyle: { backgroundColor: t.paper2 },
              }}
            />
            <Stack.Screen
              name="limit"
              options={{
                presentation: SHEET_PRESENTATION,
                animation: Platform.OS === 'ios' ? undefined : 'slide_from_bottom',
                sheetAllowedDetents: [0.3],
                sheetGrabberVisible: true,
                contentStyle: { backgroundColor: t.paper2 },
              }}
            />
          </Stack>
          <ToastHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
