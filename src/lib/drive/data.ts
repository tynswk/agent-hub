// Drive タブの状態：範囲・ピン留め・最近の一覧・ツリーの開閉と中身（pages.js の移植）
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '@/components/Toast';
import {
  type DFile,
  type Kids,
  getRootId,
  listChildren,
  listRecent,
  resetCaches,
  resolvePath,
} from '@/lib/drive/api';
import { authStore, logout } from '@/lib/drive/auth';
import { jget, jset } from '@/lib/drive/cache';
import { createStore } from '@/lib/kakeibo';

export const ALL = 'マイドライブ全体';
export const ROOT = 'AI_Agents';

export const driveUi = createStore({
  mode: 'recent' as 'recent' | 'tree',
  scope: ROOT,
  query: '',
  ready: false,
});
export const pinStore = createStore({ pins: [ROOT, ROOT + '/dev'] as string[] });

// 共有フォルダの改名（Claude → AI_Agents、ADR-0022）より前に保存された範囲・ピンを新名へ
const renamed = (p: string) => (p === 'Claude' ? ROOT : p.startsWith('Claude/') ? ROOT + p.slice('Claude'.length) : p);

export async function initDriveUi() {
  if (driveUi.get().ready) return;
  const sc = await AsyncStorage.getItem('dv_scope');
  const pins = await jget<string[]>('dv_pins');
  driveUi.set({ scope: sc ? renamed(sc) : ROOT, ready: true });
  if (Array.isArray(pins)) pinStore.set({ pins: pins.map(renamed) });
}

export function setScope(scope: string) {
  driveUi.set({ scope, query: '' });
  recentStore.set({ pending: 0, items: recentMem.get(scope) ?? null });
  void AsyncStorage.setItem('dv_scope', scope);
  void loadRecent(true);
}
export function togglePin(path: string) {
  const cur = pinStore.get().pins;
  const on = !cur.includes(path);
  const next = on ? [...cur, path] : cur.filter((x) => x !== path);
  pinStore.set({ pins: next });
  void jset('dv_pins', next);
  toast(on ? 'ピン留めしました' : 'ピンを外しました');
}

/* ===== 最近 ===== */
const recentMem = new Map<string, DFile[]>();
export const recentStore = createStore({ items: null as DFile[] | null, pending: 0, loading: false });
let seq = 0;

async function scopeId(scope: string) {
  if (scope === ALL) return null;
  const id = await resolvePath(scope);
  if (!id) throw new Error('範囲のフォルダが見つかりません: ' + scope);
  return id;
}

// 保存してある前回の一覧を先に出し、裏で取り直して差し替える
export async function loadRecent(force = false) {
  if (authStore.get().status !== 'in') return;
  const my = ++seq;
  const sc = driveUi.get().scope;
  if (!force && !recentMem.has(sc)) {
    const cached = await jget<DFile[]>('dv_r:' + sc);
    if (cached && my === seq && !recentMem.has(sc)) {
      recentMem.set(sc, cached);
      recentStore.set({ items: cached });
    }
  } else if (recentMem.has(sc)) {
    recentStore.set({ items: recentMem.get(sc)! });
  }
  recentStore.set({ loading: true });
  try {
    const items = await listRecent(await scopeId(sc));
    if (my !== seq || sc !== driveUi.get().scope) return;
    recentMem.set(sc, items);
    recentStore.set({ items, pending: 0 });
    void jset('dv_r:' + sc, items);
  } catch (e) {
    console.warn('recent', e);
    toast('読み込めませんでした');
  } finally {
    if (my === seq) recentStore.set({ loading: false });
  }
}
// 15秒ごと：先頭ページだけ見て、新着があればピルを出す（一覧は動かさない）
export async function checkRecent() {
  const sc = driveUi.get().scope;
  const cur = recentMem.get(sc);
  if (!cur || driveUi.get().mode !== 'recent' || authStore.get().status !== 'in') return;
  try {
    const items = await listRecent(await scopeId(sc), { want: 0, maxPages: 1 });
    if (sc !== driveUi.get().scope) return;
    const known = new Map(cur.map((f) => [f.id, f.modifiedTime]));
    recentStore.set({ pending: items.filter((f) => known.get(f.id) !== f.modifiedTime).length });
  } catch (e) {
    console.warn('新着の確認に失敗', e);
  }
}

/* ===== ツリー ===== */
// 開いているフォルダのキー（ピン留めは "pin:" 付き）と、フォルダID -> 中身
export const treeStore = createStore({
  open: [] as string[],
  kids: {} as Record<string, Kids>,
  rootId: '',
  pinIds: {} as Record<string, string | null>,
});
const sig = (d: Kids) => d.folders.map((f) => f.id).join() + '|' + d.files.map((f) => f.id + f.modifiedTime).join();
const inflight = new Set<string>();

export async function loadKids(id: string) {
  if (inflight.has(id)) return;
  inflight.add(id);
  try {
    if (!treeStore.get().kids[id]) {
      const cached = await jget<Kids>('dv_k:' + id);
      if (cached && !treeStore.get().kids[id]) treeStore.set({ kids: { ...treeStore.get().kids, [id]: cached } });
    }
    const d = await listChildren(id);
    const cur = treeStore.get().kids[id];
    if (!cur || sig(cur) !== sig(d)) treeStore.set({ kids: { ...treeStore.get().kids, [id]: d } });
    void jset('dv_k:' + id, d);
  } catch (e) {
    console.warn('kids', e);
    if (!treeStore.get().kids[id]) toast('読み込めませんでした');
  } finally {
    inflight.delete(id);
  }
}
export function toggleDir(key: string, id: string) {
  const open = treeStore.get().open;
  if (open.includes(key)) treeStore.set({ open: open.filter((k) => k !== key) });
  else {
    treeStore.set({ open: [...open, key] });
    void loadKids(id);
  }
}
export async function initTree() {
  try {
    const rid = await getRootId();
    treeStore.set({ rootId: rid });
    void loadKids(rid);
    for (const k of treeStore.get().open) void loadKids(k.replace(/^pin:/, ''));
  } catch (e) {
    console.warn('tree', e);
    toast('読み込めませんでした');
  }
}
export async function resolvePins(paths: string[]) {
  const ids: Record<string, string | null> = { ...treeStore.get().pinIds };
  await Promise.all(
    paths.map(async (p) => {
      if (p in ids && ids[p]) return;
      ids[p] = await resolvePath(p).catch(() => null);
    }),
  );
  treeStore.set({ pinIds: ids });
}

export async function driveLogout() {
  await logout();
  resetCaches();
  recentMem.clear();
  recentStore.set({ items: null, pending: 0 });
  treeStore.set({ open: [], kids: {}, rootId: '', pinIds: {} });
  driveUi.set({ query: '' });
}
