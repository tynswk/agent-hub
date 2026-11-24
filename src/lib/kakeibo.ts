import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { apiGet } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

export type Entry = {
  id: string;
  date: string; // YYYY/MM/DD
  amount: number;
  name: string;
  detail: string;
  category_id: string;
  category: string;
  source: string;
  at: string;
  receipt: string;
};
export type EntriesRes = {
  month: string;
  entries: Entry[];
  total: number;
  expense: number;
  income: number;
  edit_preserves_detail?: boolean;
};
export type Cat = { id: string; name: string; big: string; kind: string };
export type Cats = { expense: Cat[]; income: Cat[] };
export type Group = { name?: string; amount?: number; category?: string; detail?: string };
export type PendingJob = {
  id: string;
  store?: string;
  date?: string;
  total?: number | null;
  problems?: string[];
  groups?: Group[];
};
export type ManualPayload = {
  date: string; // YYYY-MM-DD
  name: string;
  detail: string;
  amount: number;
  income: boolean;
  category: string; // 'auto' か ID
  mid: string;
};

export const fmt = (n: number) => Math.abs(n).toLocaleString('ja-JP');
export const signed = (n: number) => (n < 0 ? '−' : '+') + fmt(n);

const p2 = (n: number) => String(n).padStart(2, '0');
export function dateStr(d: Date) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export const todayStr = () => dateStr(new Date());
export const monthNow = () => todayStr().slice(0, 7);
export function shiftMonth(ym: string, d: number) {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(y, m - 1 + d, 1);
  return `${t.getFullYear()}-${p2(t.getMonth() + 1)}`;
}
export function parseDate(s: string) {
  const [y, m, d] = s.replaceAll('/', '-').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}
export function dayLabel(date: string) {
  const t = todayStr();
  const y = dateStr(new Date(Date.now() - 86400000));
  const iso = date.replaceAll('/', '-');
  if (iso === t) return '今日';
  if (iso === y) return '昨日';
  const [, mm, dd] = date.split('/').map(Number);
  return `${mm}/${dd}`;
}
export function newMid() {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return 'pwa_' + s;
}

// カテゴリ割合の配色（PWA と同じ）
export const PALETTE = ['#e3a23f', '#6ea8c9', '#8fbc8f', '#c97b8a', '#9b8fc4', '#c4a484', '#7f9aa3', '#93979f'];

// ---- 小さなストア（表示中の月・絞り込み日、シートへ渡す内容）
function createStore<T extends object>(init: T) {
  let state = init;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      subs.forEach((f) => f());
    },
    use(): T {
      return useSyncExternalStore(
        (f) => {
          subs.add(f);
          return () => subs.delete(f);
        },
        () => state,
      );
    },
  };
}

export const kkView = createStore({ month: monthNow(), day: '' });
export type SheetCtx =
  | { mode: 'new' }
  | { mode: 'edit'; entry: Entry }
  | { mode: 'category'; payload: ManualPayload }
  | { mode: 'review'; job: PendingJob };
export const kkSheet = createStore<{ ctx: SheetCtx }>({ ctx: { mode: 'new' } });

// ---- クエリ
export function useEntries(month: string) {
  return useQuery({
    queryKey: ['kk', 'entries', month],
    queryFn: () => apiGet<EntriesRes>(`/api/kakeibo/entries?month=${month}`),
  });
}
export function useCats() {
  return useQuery({
    queryKey: ['kk', 'cats'],
    queryFn: () => apiGet<Cats>('/api/kakeibo/categories'),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}
export function usePending() {
  return useQuery({
    queryKey: ['kk', 'pending'],
    queryFn: () => apiGet<{ pending?: PendingJob[] }>('/api/kakeibo/pending'),
    select: (d) => d.pending ?? [],
  });
}
export const reloadEntries = () => queryClient.invalidateQueries({ queryKey: ['kk', 'entries'] });
export const reloadPending = () => queryClient.invalidateQueries({ queryKey: ['kk', 'pending'] });

// 一覧の行を先に消す（削除の応答を待たない）
export function removeEntryFromCache(id: string) {
  queryClient.setQueriesData<EntriesRes>({ queryKey: ['kk', 'entries'] }, (d) => {
    if (!d) return d;
    const entries = d.entries.filter((e) => e.id !== id);
    return {
      ...d,
      entries,
      total: entries.reduce((s, e) => s + e.amount, 0),
      expense: -entries.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0),
      income: entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0),
    };
  });
}
