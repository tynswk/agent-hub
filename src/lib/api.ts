// pwa_api への通信。書き込み系は EXPO_PUBLIC_MOCK_WRITES=1 のときネットワークに出さず、ローカルで成功応答を返す。
import * as FileSystem from 'expo-file-system/legacy';

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

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

export async function apiGet<T>(path: string): Promise<T> {
  const mockJob = path.match(/^\/api\/kakeibo\/receipts\/(mock_[^/]+)$/);
  if (process.env.EXPO_PUBLIC_MOCK_WRITES === '1' && mockJob) {
    const m = (require('@/lib/apiMock') as typeof import('@/lib/apiMock'));
    const status = m.mockPoll(mockJob[1]);
    await m.sleep(200);
    return { ok: true, id: mockJob[1], status } as T;
  }
  const r = await fetch(API_BASE + path);
  const d = await parse<T>(r);
  if (process.env.EXPO_PUBLIC_MOCK_WRITES === '1') {
    const m = (require('@/lib/apiMock') as typeof import('@/lib/apiMock'));
    if (path.startsWith('/api/kakeibo/entries?')) return m.overlayEntries(d as unknown as import('@/lib/apiMock').EntriesRes) as T;
    if (path === '/api/sessions') return m.overlaySessions(d as unknown as { sessions?: import('@/lib/apiMock').Sess[] }) as T;
    if (path === '/api/kakeibo/pending') {
      const p = d as unknown as { pending?: { id: string }[] };
      return { ...p, pending: m.mockPendingFilter(p.pending ?? []) } as T;
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
  if (process.env.EXPO_PUBLIC_MOCK_WRITES === '1') {
    const m = (require('@/lib/apiMock') as typeof import('@/lib/apiMock'));
    await m.sleep(700);
    return m.mockWrite(path, body) as T;
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
  if (process.env.EXPO_PUBLIC_MOCK_WRITES === '1') {
    const m = (require('@/lib/apiMock') as typeof import('@/lib/apiMock'));
    await m.sleep(600);
    return { ok: true, job_id: m.mockJobId(jobKey) };
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

export type StartRequest = { kind: string; model: string; effort: string; prompt: string };
export type StartFile = { uri: string; name: string; mime: string };

// セッションの新規起動。添付ありは multipart（フィールド名は PWA と同じ kind / model / effort / prompt / file）。
export async function startSession(
  req: StartRequest,
  file?: StartFile | null,
): Promise<{ ok?: boolean; message?: string }> {
  if (process.env.EXPO_PUBLIC_MOCK_WRITES === '1') {
    const m = (require('@/lib/apiMock') as typeof import('@/lib/apiMock'));
    await m.sleep(2200);
    return m.mockWrite('/api/sessions/start', req) as { ok?: boolean; message?: string };
  }
  if (!file) return apiPost('/api/sessions/start', req);
  const res = await FileSystem.uploadAsync(`${API_BASE}/api/sessions/start`, file.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: file.mime,
    parameters: { ...req },
  });
  let d: { ok?: boolean; message?: string } = {};
  try {
    d = JSON.parse(res.body);
  } catch {
    // JSON でない
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(d.message || `HTTP ${res.status}`, res.status);
  }
  return d;
}
