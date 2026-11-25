import * as Updates from 'expo-updates';
import { AppState } from 'react-native';

let checking = false;

async function checkAndFetch(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || checking) return;
  checking = true;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (res.isAvailable) {
      await Updates.fetchUpdateAsync();
    }
  } catch {
    // オフライン・Tailscale 未接続時は黙って次回に回す
  } finally {
    checking = false;
  }
}

/**
 * フォアグラウンド復帰時に裏で OTA 更新を確認・取得する。
 * 起動直後の更新はネイティブ側の fallbackToCacheTimeout で即時反映される。
 * 復帰時に取得した更新は次回起動時に適用される（入力中の状態を飛ばさないため）。
 */
export function startOtaWatcher(): () => void {
  if (__DEV__ || !Updates.isEnabled) return () => {};
  let prev = AppState.currentState;
  const sub = AppState.addEventListener('change', (next) => {
    if (prev !== 'active' && next === 'active') {
      void checkAndFetch();
    }
    prev = next;
  });
  return () => sub.remove();
}
