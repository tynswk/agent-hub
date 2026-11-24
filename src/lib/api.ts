// pwa_api への通信。書き込み系は EXPO_PUBLIC_MOCK_WRITES=1 のときネットワークに出さず、ローカルで成功応答を返す。
import * as FileSystem from 'expo-file-system/legacy';

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/$/, '');
export const MOCK_WRITES = process.env.EXPO_PUBLIC_MOCK_WRITES === '1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function parse<T>(r: Response): Promise<T> {
  let d: unknown = null;
  try {
    d = await r.json();
  } catch {
    // 応答が JSON でない
  }
  if (!r.ok) {
    const m = (d as { message?: string } | null)?.message;
    throw new ApiError(m || `HTTP ${r.status}`, r.status);
  }
  return d as T;
}

// ---- モック（書き込み系だけ）。読み取り結果に重ねて、書いた内容が見えるようにする。
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
type EntriesRes = { month: string; entries: Entry[]; total: number; expense: number; income: number };

const mock = {
  added: [] as Entry[],
  updated: new Map<string, Partial<Entry>>(),
  deleted: new Set<string>(),
  confirmed: new Set<string>(),
  polls: new Map<string, number>(),
  seq: 0,
};

function overlayEntries(d: EntriesRes): EntriesRes {
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

function mockWrite(path: string, body: unknown): unknown {
  const b = (body ?? {}) as Record<string, unknown>;
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

export async function apiGet<T>(path: string): Promise<T> {
  const mockJob = path.match(/^\/api\/kakeibo\/receipts\/(mock_[^/]+)$/);
  if (MOCK_WRITES && mockJob) {
    const n = (mock.polls.get(mockJob[1]) ?? 0) + 1;
    mock.polls.set(mockJob[1], n);
    await sleep(200);
    return { ok: true, id: mockJob[1], status: n >= 3 ? 'done' : 'processing' } as T;
  }
  const r = await fetch(API_BASE + path);
  const d = await parse<T>(r);
  if (MOCK_WRITES) {
    if (path.startsWith('/api/kakeibo/entries?')) return overlayEntries(d as unknown as EntriesRes) as T;
    if (path === '/api/kakeibo/pending') {
      const p = d as unknown as { pending?: { id: string }[] };
      return { ...p, pending: (p.pending ?? []).filter((j) => !mock.confirmed.has(j.id)) } as T;
    }
  }
  return d;
}

// POST（JSON）。PUT/DELETE も同じ口で扱う。
export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  if (MOCK_WRITES) {
    await sleep(700);
    return mockWrite(path, body) as T;
  }
  const r = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(r);
}
export const apiPost = <T>(path: string, body?: unknown) => apiSend<T>('POST', path, body);

// レシート画像の送信（multipart、field `file`、`job_key`）。
export async function uploadReceipt(
  fileUri: string,
  jobKey: string,
): Promise<{ ok: boolean; job_id?: string; message?: string }> {
  if (MOCK_WRITES) {
    await sleep(600);
    return { ok: true, job_id: `mock_${jobKey.slice(-8)}_${++mock.seq}` };
  }
  const res = await FileSystem.uploadAsync(`${API_BASE}/api/kakeibo/receipts`, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    parameters: { job_key: jobKey },
  });
  let d: { ok?: boolean; job_id?: string; message?: string } = {};
  try {
    d = JSON.parse(res.body);
  } catch {
    // JSON でない
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(d.message || `HTTP ${res.status}`, res.status);
  }
  return { ok: !!d.ok, job_id: d.job_id, message: d.message };
}
