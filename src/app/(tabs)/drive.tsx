'use no memo';
import { router, useLocalSearchParams } from 'expo-router';
import { Ellipsis } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RecentList } from '@/components/drive/RecentList';
import { TreeList } from '@/components/drive/TreeList';
import { GlassMenu } from '@/components/GlassMenu';
import { Loader } from '@/components/Loader';
import { PillSegment } from '@/components/PillSegment';
import { Press } from '@/components/Press';
import { ScreenShell } from '@/components/ScreenShell';
import { toast } from '@/components/Toast';
import { findByPath, getMeta } from '@/lib/drive/api';
import { authStore, login } from '@/lib/drive/auth';
import { driveLogout, driveUi, initDriveUi } from '@/lib/drive/data';
import { openFile } from '@/lib/drive/open';
import { useTheme } from '@/theme';

function LoginView() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.center}>
      <Press
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await login();
          } catch (e) {
            console.warn('login', e);
            toast('ログインできませんでした');
          } finally {
            setBusy(false);
          }
        }}
        style={[styles.loginBtn, { backgroundColor: t.field, borderColor: t.glassBrd }]}
      >
        {busy ? <Loader size={18} /> : null}
        <Text style={[styles.loginText, { color: t.ink }]}>Google でログイン</Text>
      </Press>
    </View>
  );
}

export default function DriveScreen() {
  const auth = authStore.useStore();
  const ui = driveUi.useStore();
  const params = useLocalSearchParams<{ id?: string; path?: string }>();

  useEffect(() => {
    void initDriveUi();
  }, []);

  // agenthub://drive?path=… / ?id=…（id 優先）。未ログインならログイン後に開く
  useEffect(() => {
    if (auth.status !== 'in') return;
    const id = typeof params.id === 'string' ? params.id : '';
    const path = typeof params.path === 'string' ? params.path : '';
    if (!id && !path) return;
    router.setParams({ id: undefined, path: undefined });
    (async () => {
      try {
        const f = id ? await getMeta(id) : await findByPath(path);
        if (!f) toast('指定したファイルが見つかりません');
        else openFile(f);
      } catch (e) {
        console.warn('deeplink', e);
        toast('ファイルを開けませんでした');
      }
    })();
  }, [auth.status, params.id, params.path]);

  if (auth.status === 'loading') return <ScreenShell title="" />;
  if (auth.status === 'out') {
    return (
      <ScreenShell title="Drive">
        <LoginView />
      </ScreenShell>
    );
  }
  return (
    <ScreenShell
      title={
        <PillSegment
          width={200}
          options={[
            { key: 'recent', label: '最近の項目' },
            { key: 'tree', label: 'ツリー' },
          ]}
          value={ui.mode}
          onChange={(k) => driveUi.set({ mode: k })}
        />
      }
      right={<MoreMenu />}
    >
      {ui.mode === 'recent' ? <RecentList onOpen={openFile} /> : <TreeList onOpen={openFile} />}
    </ScreenShell>
  );
}

function MoreMenu() {
  const t = useTheme();
  return (
    <GlassMenu
      items={[{ key: 'logout', label: 'ログアウト', onSelect: () => void driveLogout() }]}
      width={190}
    >
      {(open) => (
        <Press mode="dim" onPress={open} style={styles.more} accessibilityLabel="その他">
          <Ellipsis size={22} color={t.ink} />
        </Press>
      )}
    </GlassMenu>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginBtn: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginText: { fontSize: 16, fontWeight: '600' },
  more: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
