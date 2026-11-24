// EXPO_PUBLIC_MOCK_WRITES=1 のときだけ api.ts が require する。本番バンドルには入らない。
import { modelName } from '@/lib/models';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mockPoll(id: string): string {
  const n = (mock.polls.get(id) ?? 0) + 1;
  mock.polls.set(id, n);
  return n >= 3 ? 'done' : 'processing';
}

export function mockJobId(jobKey: string): string {
  return `mock_${jobKey.slice(-8)}_${++mock.seq}`;
}

export const mockPendingFilter = <T extends { id: string }>(l: T[]) => l.filter((j) => !mock.confirmed.has(j.id));

// 書き込み系のモック。読み取り結果に重ねて、書いた内容が見えるようにする。
type Entry = {
  id: string;
  date: string;
  amount: number;
  name: string;
  detail: string;
  category_id: string;
  category: string;
  source: string;
  at: string;
  receipt: string;
};
export type EntriesRes = { month: string; entries: Entry[]; total: number; expense: number; income: number };

export type Sess = { id: string; kind: string; title: string; model: string; last_active: number; running: boolean };

const mock = {
  sessRun: new Map<string, boolean>(), // 'kind:id' -> running（resume/stop で上書き）
  sessAdded: [] as Sess[], // start で足した行
  added: [] as Entry[],
  updated: new Map<string, Partial<Entry>>(),
  deleted: new Set<string>(),
  confirmed: new Set<string>(),
  polls: new Map<string, number>(),
  seq: 0,
};

export function overlayEntries(d: EntriesRes): EntriesRes {
  const prefix = d.month.replace('-', '/');
  const own = mock.added.filter((e) => e.date.startsWith(prefix));
  const list = [...own.slice().reverse(), ...d.entries]
    .filter((e) => !mock.deleted.has(e.id))
    .map((e) => (mock.updated.has(e.id) ? { ...e, ...mock.updated.get(e.id) } : e));
  // 編集で別の月に移った行は、その月の表示では除く
  const kept = list.filter((e) => e.date.startsWith(prefix));
  const total = kept.reduce((s, e) => s + e.amount, 0);
  const expense = -kept.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  const income = kept.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  return { ...d, entries: kept, total, expense, income };
}

export function overlaySessions(d: { sessions?: Sess[] }): { sessions: Sess[] } {
  const list = [...mock.sessAdded.slice().reverse(), ...(d.sessions ?? [])].map((s) => {
    const r = mock.sessRun.get(`${s.kind}:${s.id}`);
    return r === undefined ? s : { ...s, running: r };
  });
  return { ...d, sessions: list };
}

export function mockWrite(path: string, body: unknown): unknown {
  const b = (body ?? {}) as Record<string, unknown>;
  if (path === '/api/sessions/resume' || path === '/api/sessions/stop') {
    mock.sessRun.set(`${String(b.kind ?? 'claude')}:${String(b.id ?? '')}`, path.endsWith('/resume'));
    return { ok: true, message: 'モック' };
  }
  if (path === '/api/sessions/start') {
    const prompt = String(b.prompt ?? '');
    const model = modelName(String(b.model ?? ''));
    mock.sessAdded.push({
      id: `mock_${++mock.seq}`,
      kind: String(b.kind ?? 'claude'),
      title: prompt.split('\n')[0] || model,
      model,
      last_active: Date.now() / 1000,
      running: true,
    });
    return { ok: true, message: 'モック' };
  }
  let m = path.match(/^\/api\/kakeibo\/entries\/([^/]+)\/update$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const amount = Number(b.amount);
    const patch: Partial<Entry> = {
      date: String(b.date ?? '').replaceAll('-', '/'),
      name: String(b.name ?? ''),
      amount: b.income ? amount : -amount,
    };
    if (b.category && b.category !== 'keep') patch.category_id = String(b.category);
    if (b.category === '') patch.category_id = '';
    mock.updated.set(id, { ...(mock.updated.get(id) ?? {}), ...patch });
    return { ok: true, id, category: '' };
  }
  m = path.match(/^\/api\/kakeibo\/entries\/([^/]+)\/delete$/);
  if (m) {
    mock.deleted.add(decodeURIComponent(m[1]));
    return { ok: true, id: decodeURIComponent(m[1]) };
  }
  if (path === '/api/kakeibo/entries') {
    if (b.category === 'auto' && !String(b.name ?? '').trim()) {
      return { ok: false, needs_category: true, categories: [] };
    }
    const amount = Number(b.amount);
    const id = `mock_${++mock.seq}`;
    mock.added.push({
      id,
      date: String(b.date ?? '').replaceAll('-', '/'),
      amount: b.income ? amount : -amount,
      name: String(b.name ?? ''),
      detail: '',
      category_id: b.category && b.category !== 'auto' ? String(b.category) : '',
      category: '',
      source: 'モック',
      at: '',
      receipt: '',
    });
    return { ok: true, id, mid: b.mid, category: '' };
  }
  m = path.match(/^\/api\/kakeibo\/receipts\/([^/]+)\/confirm$/);
  if (m) {
    mock.confirmed.add(decodeURIComponent(m[1]));
    return { ok: true };
  }
  return { ok: true };
}

