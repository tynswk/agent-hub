import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MiniPlayer } from '@/components/drive/MiniPlayer';
import { LAST_TAB_KEY, PillTabBar } from '@/components/PillTabBar';
import { useQuickActions } from '@/lib/quickActions';
import { tabBoot } from '@/tabState';

const TABS = ['index', 'kakeibo', 'drive'];

export default function TabsLayout() {
  const router = useRouter();
  useQuickActions();
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
        router.navigate(`/${initial}` as '/kakeibo' | '/drive');
      }
      setTimeout(() => {
        tabBoot.instant = false;
        setReady(true);
      }, 60);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  if (!initial) return null;
  return (
    <View style={[styles.flex, { opacity: ready ? 1 : 0 }]}>
      <View style={styles.col}>
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
        <MiniPlayer />
      </View>
    </View>
  );
}

// iPad など広い画面では 720pt の列を中央に置く
const styles = StyleSheet.create({
  flex: { flex: 1 },
  col: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
