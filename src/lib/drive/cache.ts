// 端末に置くキャッシュ。一覧・フォルダの中身は AsyncStorage、本文は cacheDirectory のファイル（合計150MB・1件30MB）。
// 失敗しても動作は止めない（読めなければ「無かった」扱い、書けなければ捨てる）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const DIR = (FileSystem.cacheDirectory ?? '') + 'drive/v1/';
const BODY_MAX = 30 * 1048576;
const BODY_TOTAL = 150 * 1048576;
const IDX = 'dv_bodies';

export async function jget<T>(key: string): Promise<T | undefined> {
  try {
    const s = await AsyncStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}
export async function jset(key: string, v: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(v));
  } catch (e) {
    console.warn('cache', e);
  }
}

type Rec = { id: string; bytes: number; at: number; version: string; path: string };

async function readIdx(): Promise<Rec[]> {
  return (await jget<Rec[]>(IDX)) ?? [];
}

export const bodyPath = (id: string, ext: string) => `${DIR}${id}.${ext}`;

export async function getBody(id: string): Promise<{ version: string; path: string } | undefined> {
  const list = await readIdx();
  const rec = list.find((r) => r.id === id);
  if (!rec) return undefined;
  const info = await FileSystem.getInfoAsync(rec.path).catch(() => null);
  if (!info?.exists) return undefined;
  rec.at = Date.now();
  void jset(IDX, list);
  return { version: rec.version, path: rec.path };
}

// すでにファイルとして置いたもの（PDF のダウンロード等）を索引に載せ、上限を超えたら古いものから消す
export async function registerBody(id: string, version: string, path: string) {
  const info = await FileSystem.getInfoAsync(path).catch(() => null);
  if (!info?.exists) return;
  const bytes = 'size' in info ? info.size : 0;
  if (bytes > BODY_MAX) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    return;
  }
  let list = (await readIdx()).filter((r) => r.id !== id);
  list.push({ id, bytes, at: Date.now(), version, path });
  let total = list.reduce((a, r) => a + r.bytes, 0);
  list = [...list].sort((a, b) => a.at - b.at);
  while (total > BODY_TOTAL && list.length > 1) {
    const old = list.shift()!;
    total -= old.bytes;
    await FileSystem.deleteAsync(old.path, { idempotent: true }).catch(() => undefined);
  }
  await jset(IDX, list);
}

export async function putBodyText(id: string, version: string, text: string) {
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
    const path = bodyPath(id, 'txt');
    await FileSystem.writeAsStringAsync(path, text);
    await registerBody(id, version, path);
  } catch (e) {
    console.warn('cache body', e);
  }
}
export async function readBodyText(path: string): Promise<string | undefined> {
  try {
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return undefined;
  }
}
export async function ensureDir() {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
}
