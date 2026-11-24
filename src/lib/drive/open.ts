import { router } from 'expo-router';
import { type DFile, reg } from '@/lib/drive/api';

// ビューアを開く（全画面のシート）。一覧の行から来たものは reg に載せておき、ビューアが id で引く
export function openFile(f: DFile) {
  reg.set(f.id, f);
  router.push({ pathname: '/viewer' as '/', params: { id: f.id } });
}
