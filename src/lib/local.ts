// 端末側の控え（送信待ちのレシート画像・処理中ジョブ・手入力の未達分）と、その再送。
// 画像はアプリの documentDirectory にファイルで置き、記録は expo-sqlite。サーバーが受け付けた確認が取れるまで消さない。
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import * as SQLite from 'expo-sqlite';
import { router } from 'expo-router';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSyncExternalStore } from 'react';
import { toast } from '@/components/Toast';
import { apiGet, apiPost, uploadReceipt } from '@/lib/api';
import {
  type ManualPayload,
  kkSheet,
  kkView,
  monthNow,
  newMid,
  reloadEntries,
  reloadPending,
} from '@/lib/kakeibo';

export type ReceiptRec = { key: string; uri: string; ts: number };
export type ManualRec = { payload: ManualPayload; needsCategory: boolean };
type LocalState = { receipts: ReceiptRec[]; jobs: string[]; manual: ManualRec[]; busy: string[] };

let state: LocalState = { receipts: [], jobs: [], manual: [], busy: [] };
const subs = new Set<() => void>();
function setState(patch: Partial<LocalState>) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export function useLocal(): LocalState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

let dbp: Promise<SQLite.SQLiteDatabase> | null = null;
function db() {
  if (!dbp) {
    dbp = (async () => {
      const d = await SQLite.openDatabaseAsync('kakeibo-outbox.db');
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS receipts (key TEXT PRIMARY KEY, uri TEXT NOT NULL, ts INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS manual (mid TEXT PRIMARY KEY, payload TEXT NOT NULL, needs_category INTEGER NOT NULL DEFAULT 0);
      `);
      return d;
    })();
  }
  return dbp;
}

const RECEIPT_DIR = (FileSystem.documentDirectory ?? '') + 'receipts/';

// ---- 撮影・選択した画像を、長辺 2400px の JPEG にして控える
export async function stageReceipt(srcUri: string, w: number, h: number) {
  const long = Math.max(w, h);
  const ctx = ImageManipulator.ImageManipulator.manipulate(srcUri);
  if (long > 2400) {
    const k = 2400 / long;
    ctx.resize(w >= h ? { width: Math.round(w * k) } : { height: Math.round(h * k) });
  }
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 });
  await FileSystem.makeDirectoryAsync(RECEIPT_DIR, { intermediates: true }).catch(() => {});
  const key = newMid();
  const dest = `${RECEIPT_DIR}${key}.jpg`;
  await FileSystem.copyAsync({ from: out.uri, to: dest });
  const rec: ReceiptRec = { key, uri: dest, ts: Date.now() };
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO receipts (key, uri, ts) VALUES (?, ?, ?)', [rec.key, rec.uri, rec.ts]);
  setState({ receipts: [...state.receipts, rec] });
  void flushOutbox();
}

// ---- レシート送信
let flushing = false;
let lastSendError = '';
export async function flushOutbox(showError = false) {
  if (flushing) return;
  flushing = true;
  try {
    for (const rec of [...state.receipts]) {
      try {
        const d = await uploadReceipt(rec.uri, rec.key);
        if (!d.ok || !d.job_id) throw new Error(d.message || 'レシートの受付を確認できませんでした');
        const dbh = await db();
        await dbh.runAsync('INSERT OR IGNORE INTO jobs (id) VALUES (?)', [d.job_id]);
        if (!state.jobs.includes(d.job_id)) {
          setState({ jobs: [...state.jobs, d.job_id] });
          void pollJob(d.job_id);
        }
        await dbh.runAsync('DELETE FROM receipts WHERE key = ?', [rec.key]);
        FileSystem.deleteAsync(rec.uri, { idempotent: true }).catch(() => {});
        setState({ receipts: state.receipts.filter((x) => x.key !== rec.key) });
      } catch (e) {
        lastSendError = (e as Error)?.message || '送信エラー';
        // 控えに残したまま次回再送
      }
    }
  } finally {
    flushing = false;
    if (showError && state.receipts.length && lastSendError) toast('送信できませんでした: ' + lastSendError);
  }
}

const polling = new Set<string>();
async function pollJob(jobId: string) {
  if (polling.has(jobId)) return;
  polling.add(jobId);
  try {
    for (let i = 0; i < 130; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      let d: { status?: string; error?: string };
      try {
        d = await apiGet(`/api/kakeibo/receipts/${jobId}`);
      } catch {
        continue;
      }
      if (d.status === 'processing') continue;
      const dbh = await db();
      await dbh.runAsync('DELETE FROM jobs WHERE id = ?', [jobId]);
      setState({ jobs: state.jobs.filter((x) => x !== jobId) });
      if (d.status === 'done') {
        toast('登録しました');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (kkView.get().month !== monthNow()) kkView.set({ month: monthNow(), day: '' });
        void reloadEntries();
      } else if (d.status === 'needs_review') {
        toast('要確認があります');
        void reloadPending();
      } else toast(d.error || 'レシートを処理できませんでした');
      return;
    }
    // 追跡は控えに残す（次回起動時に再開）
    toast('処理が長引いています');
    void reloadPending();
  } finally {
    polling.delete(jobId);
  }
}

// ---- 手入力
export async function saveManual(rec: ManualRec) {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO manual (mid, payload, needs_category) VALUES (?, ?, ?)', [
    rec.payload.mid,
    JSON.stringify(rec.payload),
    rec.needsCategory ? 1 : 0,
  ]);
  const rest = state.manual.filter((m) => m.payload.mid !== rec.payload.mid);
  setState({ manual: [...rest, rec] });
}
async function deleteManual(mid: string) {
  const d = await db();
  await d.runAsync('DELETE FROM manual WHERE mid = ?', [mid]);
  setState({ manual: state.manual.filter((m) => m.payload.mid !== mid) });
}
const setBusy = (mid: string, on: boolean) =>
  setState({ busy: on ? [...state.busy.filter((x) => x !== mid), mid] : state.busy.filter((x) => x !== mid) });

export function openCategorySheet(payload: ManualPayload) {
  kkSheet.set({ ctx: { mode: 'category', payload } });
  router.push('/manual');
}

export async function sendManual(rec: ManualRec, foreground = false) {
  const { payload } = rec;
  const { mid } = payload;
  if (state.busy.includes(mid)) return;
  setBusy(mid, true);
  try {
    const d = await apiPost<{ ok?: boolean; needs_category?: boolean; category?: string; message?: string }>(
      '/api/kakeibo/entries',
      payload,
    );
    if (d.needs_category) {
      const latest = state.manual.find((m) => m.payload.mid === mid);
      if (latest && JSON.stringify(latest.payload) === JSON.stringify(payload)) {
        await saveManual({ payload, needsCategory: true });
        if (foreground) {
          toast('カテゴリーを選んでください');
          openCategorySheet(payload);
        }
      }
    } else if (d.ok) {
      await deleteManual(mid);
      if (foreground) {
        toast(d.category ? `登録しました（${d.category}）` : '登録しました');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (payload.date) kkView.set({ month: payload.date.slice(0, 7), day: '' });
      }
      void reloadEntries();
    } else if (foreground) {
      toast(d.message || '登録できませんでした');
    }
  } catch {
    // 未達：控えに残し「送信待ち」行として出す。復帰時に自動再送
    if (foreground) toast('送信できませんでした。送信待ちに残しました');
  } finally {
    setBusy(mid, false);
  }
}

let flushingManual = false;
export async function flushManual() {
  if (flushingManual) return;
  flushingManual = true;
  try {
    for (const m of [...state.manual]) {
      const latest = state.manual.find((x) => x.payload.mid === m.payload.mid);
      if (latest && !latest.needsCategory) await sendManual(latest);
    }
  } finally {
    flushingManual = false;
  }
}

// ---- 再送のきっかけ：起動時・アプリが前に出たとき・回線が戻ったとき・リロード
export async function retryAll(showError = false) {
  await Promise.allSettled([flushOutbox(showError), flushManual()]);
  for (const j of state.jobs) void pollJob(j);
}

let started = false;
export async function initLocal() {
  if (started) return;
  started = true;
  const d = await db();
  const receipts = await d.getAllAsync<ReceiptRec>('SELECT key, uri, ts FROM receipts ORDER BY ts');
  const jobs = (await d.getAllAsync<{ id: string }>('SELECT id FROM jobs')).map((r) => r.id);
  const manual = (
    await d.getAllAsync<{ payload: string; needs_category: number }>('SELECT payload, needs_category FROM manual')
  ).map((r) => ({ payload: JSON.parse(r.payload) as ManualPayload, needsCategory: !!r.needs_category }));
  setState({ receipts, jobs, manual });
  void retryAll();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void retryAll();
  });
  let wasOnline: boolean | null = null;
  NetInfo.addEventListener((s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    if (online && wasOnline === false) void retryAll();
    wasOnline = online;
  });
}
