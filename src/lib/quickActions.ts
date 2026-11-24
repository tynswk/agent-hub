// ホーム画面アイコンの長押し「撮影」。Expo Go にはネイティブ部が無いので、読み込めなければ何もしない。
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { capture } from '@/lib/capture';

type QA = typeof import('expo-quick-actions');

function load(): QA | null {
  if (Constants.appOwnership === 'expo') return null;
  try {
    return require('expo-quick-actions') as QA;
  } catch {
    return null;
  }
}

export function useQuickActions() {
  useEffect(() => {
    const qa = load();
    if (!qa) return;
    const run = (a?: { id?: string } | null) => {
      if (a?.id !== 'capture') return;
      router.navigate('/kakeibo');
      setTimeout(() => void capture(false), 500);
    };
    let sub: { remove: () => void } | undefined;
    try {
      run(qa.initial);
      sub = qa.addListener(run);
    } catch {
      // ネイティブ側が無い
    }
    return () => sub?.remove();
  }, []);
}
