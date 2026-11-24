import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Background } from '@/components/Background';
import { LAST_TAB_KEY, PillTabBar } from '@/components/PillTabBar';
import { tabBoot } from '@/tabState';
import { useTheme } from '@/theme';

const TABS = ['index', 'kakeibo', 'drive'];

export default function RootLayout() {
  const t = useTheme();
  const router = useRouter();
  const [initial, setInitial] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LAST_TAB_KEY)
      .then((v) => setInitial(v && TABS.includes(v) ? v : 'index'))
      .catch(() => setInitial('index'));
  }, []);

  // 前回開いていたタブへ。ナビゲータが立ち上がった後に1回だけ移動し、移動中は隠す。
  useEffect(() => {
    if (!initial) return;
    const id = setTimeout(() => {
      if (initial !== 'index') {
        router.navigate(initial === 'index' ? '/' : (`/${initial}` as '/kakeibo' | '/drive'));
      }
      setTimeout(() => {
        tabBoot.instant = false;
        setReady(true);
      }, 60);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <GestureHandlerRootView style={[styles.flex, { backgroundColor: t.paper }]}>
      <SafeAreaProvider>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Background />
        {initial && (
          <View style={[styles.flex, { opacity: ready ? 1 : 0 }]}>
            <Tabs
              tabBar={(props) => <PillTabBar {...props} />}
              screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: 'transparent' },
              }}
            >
              <Tabs.Screen name="index" />
              <Tabs.Screen name="kakeibo" />
              <Tabs.Screen name="drive" />
            </Tabs>
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
