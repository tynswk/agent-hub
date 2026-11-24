import { useQuery } from '@tanstack/react-query';
import { toast } from '@/components/Toast';
import { type StartFile, type StartRequest, apiGet, apiPost, startSession } from '@/lib/api';
import { createStore } from '@/lib/kakeibo';
import { modelName } from '@/lib/models';
import { queryClient } from '@/lib/queryClient';

export type Session = {
  id: string;
  kind: string;
  title: string;
  model: string;
  last_active: number; // 秒
  running: boolean;
  isNew?: boolean; // 起動中の仮の行
};
export type Limit = { id: string; remain: number | null; reset: number | null };

export const LIMITS_META = [
  { id: 'claude', name: 'Claude', sub: '' },
  { id: 'chatgpt', name: 'ChatGPT', sub: '' },
  { id: 'agy-gemini', name: 'Antigravity', sub: 'Gemini系' },
  { id: 'agy-gpt', name: 'Antigravity', sub: 'GPT系' },
];

export const keyOf = (s: { kind: string; id: string }) => `${s.kind}:${s.id}`;

// ui.js の ago() / isFresh()
export function ago(ts: number) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export const isFresh = (ts: number) => Date.now() / 1000 - ts <= 600;

export function fmtReset(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${hh}:${mm}`;
}

// 操作中の行（キー → 操作開始時の running）と、起動中の仮の行
export const sessUi = createStore({
  pending: {} as Record<string, boolean>,
  starting: null as Session | null,
});
// 上限の詳細シートへ渡す枠 ID
export const limSheet = createStore({ id: '' });

export function useSessions() {
  return useQuery({
    queryKey: ['sess', 'list'],
    queryFn: () => apiGet<{ sessions?: Session[] }>('/api/sessions'),
    select: (d) => d.sessions ?? [],
  });
}
export function useLimits() {
  return useQuery({
    queryKey: ['sess', 'limits'],
    queryFn: () => apiGet<{ limits?: Limit[] }>('/api/limits'),
    select: (d) => {
      const m: Record<string, Limit> = {};
      (d.limits ?? []).forEach((x) => {
        m[x.id] = x;
      });
      return m;
    },
    staleTime: 60_000,
  });
}
export const reloadSessions = () => queryClient.refetchQueries({ queryKey: ['sess', 'list'] });
export const reloadLimits = () => queryClient.refetchQueries({ queryKey: ['sess', 'limits'] });

// ▶ 再開 / ■ 停止
export async function toggleSession(s: Session) {
  const k = keyOf(s);
  const { pending } = sessUi.get();
  if (k in pending) return;
  sessUi.set({ pending: { ...pending, [k]: s.running } });
  try {
    const d = await apiPost<{ ok?: boolean; message?: string }>(
      s.running ? '/api/sessions/stop' : '/api/sessions/resume',
      { kind: s.kind, id: s.id },
    );
    if (!d.ok) toast(d.message || '失敗しました');
  } catch (e) {
    toast((e as Error).message);
  } finally {
    await reloadSessions().catch(() => undefined);
    const rest = { ...sessUi.get().pending };
    delete rest[k];
    sessUi.set({ pending: rest });
  }
}

// 新規起動：実行中の先頭に仮の行を出し、終わったら再取得
export async function beginSession(req: StartRequest, file: StartFile | null) {
  if (sessUi.get().starting) return;
  const label = modelName(req.model);
  sessUi.set({
    starting: {
      isNew: true,
      kind: req.kind,
      id: '__new',
      title: req.prompt.split('\n')[0] || label,
      model: label,
      last_active: Date.now() / 1000,
      running: true,
    },
  });
  try {
    const d = await startSession(req, file);
    if (!d.ok) toast(d.message || '起動に失敗しました');
  } catch (e) {
    toast((e as Error).message);
  } finally {
    await reloadSessions().catch(() => undefined);
    sessUi.set({ starting: null });
  }
}
