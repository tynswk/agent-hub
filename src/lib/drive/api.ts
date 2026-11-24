// Drive API（drive-viewer の drive.js の移植）。401 は一度だけ更新して再試行する。祖先フォルダのキャッシュ（ADR-0016）もここ。
import * as FileSystem from 'expo-file-system/legacy';
import { DRIVE_MOCK, accessToken, forceRefresh } from '@/lib/drive/auth';
import { bodyPath, ensureDir, jget, jset, registerBody } from '@/lib/drive/cache';
import { mockFetch, mockPdf } from '@/lib/drive/mock';

const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
export const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,modifiedTime,size,version,parents';
export const EXCLUDE = new Set(['.git', 'node_modules', '__pycache__']);
const TTL = 12 * 3600e3; // フォルダ情報の有効期間（移動・改名に追従するため）

export type DFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  t: number;
  size?: number;
  version?: string;
  parents: string[];
  path?: string;
};
type Raw = Partial<Omit<DFile, 'size' | 'parents'>> & { id: string; name: string; size?: string; parents?: string[] };

export class DriveError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

/* ===== 低レベル ===== */
const doFetch = (url: string, init: RequestInit) => (DRIVE_MOCK ? mockFetch(url, init) : fetch(url, init));

export async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const go = (t: string) =>
    doFetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: 'Bearer ' + t } });
  let r = await go(await accessToken());
  if (r.status === 401) r = await go(await forceRefresh());
  return r;
}
function check(r: Response, what: string) {
  if (r.ok) return r;
  throw new DriveError(`Drive ${r.status} ${what}`, r.status);
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await check(await call(API + path, init), path.split('?')[0])).json() as Promise<T>;
}

export function norm(raw: Raw): DFile {
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType || '',
    modifiedTime: raw.modifiedTime ?? '',
    t: Date.parse(raw.modifiedTime ?? ''),
    size: raw.size != null ? Number(raw.size) : undefined,
    version: raw.version,
    parents: raw.parents || [],
  };
}

// 一覧の行から id で引けるように
export const reg = new Map<string, DFile>();

/* ===== フォルダのキャッシュ（id -> {name, parents, at}） ===== */
type Dir = { name: string; parents: string[]; at: number };
const dirs = new Map<string, Dir>();
let rootId = '';
let pathIds: Record<string, { id: string; at: number }> = {};
let loaded: Promise<void> | null = null;
export function loadCaches() {
  loaded ??= (async () => {
    const d = await jget<[string, Dir][]>('dv_dirs');
    d?.forEach(([k, v]) => dirs.set(k, v));
    rootId = (await jget<string>('dv_root')) ?? '';
    pathIds = (await jget<typeof pathIds>('dv_paths')) ?? {};
  })();
  return loaded;
}
export function resetCaches() {
  dirs.clear();
  rootId = '';
  pathIds = {};
  reg.clear();
  loaded = null;
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function saveDirs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void jset('dv_dirs', [...dirs]), 500);
}
const fresh = (e?: Dir) => !!e && Date.now() - e.at < TTL;
function setDir(id: string, name: string, parents: string[]) {
  dirs.set(id, { name, parents, at: Date.now() });
  saveDirs();
}

export async function getRootId() {
  await loadCaches();
  if (!rootId) {
    rootId = (await api<{ id: string }>('files/root?fields=id')).id;
    await jset('dv_root', rootId);
  }
  return rootId;
}

async function ensureDirs(ids: string[]) {
  const need = [...new Set(ids)].filter((id) => id && !fresh(dirs.get(id)));
  await Promise.all(
    need.map(async (id) => {
      try {
        const d = await api<{ name: string; parents?: string[] }>(`files/${id}?fields=id,name,parents`);
        setDir(id, d.name, d.parents || []);
      } catch (e) {
        const st = (e as DriveError).status;
        if (st === 403 || st === 404) setDir(id, '?', []);
        else throw e;
      }
    }),
  );
}
async function resolveAncestors(fs: DFile[]) {
  let frontier = fs.flatMap((f) => f.parents);
  for (let i = 0; i < 40 && frontier.length; i++) {
    await ensureDirs(frontier);
    frontier = frontier.flatMap((id) => (dirs.get(id)?.parents || []).slice(0, 1));
  }
}
function chainOf(f: DFile) {
  const out: string[] = [];
  let id: string | undefined = f.parents[0];
  while (id && out.length < 40) {
    out.push(id);
    id = dirs.get(id)?.parents[0];
  }
  return out;
}
// 祖先IDの列（親→上）から、範囲からの相対パスを作る
function relPath(chain: string[], scopeId: string | null) {
  const names: string[] = [];
  for (const id of chain) {
    if (id === scopeId || id === rootId) break;
    names.push(dirs.get(id)?.name || '?');
  }
  return names.reverse().join('/');
}
export async function fullPath(f: DFile) {
  await getRootId();
  await resolveAncestors([f]);
  const p = relPath(chainOf(f), null);
  return 'マイドライブ/' + (p ? p + '/' : '') + f.name;
}
// マイドライブからの相対パスの親フォルダ（md の相対リンクの基準）
export async function parentDirs(f: DFile) {
  const p = (await fullPath(f)).split('/');
  return p.slice(1, -1);
}

/* ===== パス → フォルダID（ピン留め用） ===== */
const qName = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export async function resolvePath(path: string): Promise<string | null> {
  await loadCaches();
  const hit = pathIds[path];
  if (hit && Date.now() - hit.at < TTL) return hit.id;
  let parent = await getRootId();
  for (const name of path.split('/')) {
    const q = `'${parent}' in parents and name='${qName(name)}' and mimeType='${FOLDER}' and trashed=false`;
    const d = await api<{ files: Raw[] }>('files?' + new URLSearchParams({ q, pageSize: '1', fields: 'files(id,name)' }));
    if (!d.files.length) return null;
    parent = d.files[0].id;
  }
  pathIds[path] = { id: parent, at: Date.now() };
  await jset('dv_paths', pathIds);
  return parent;
}

/* ===== パス → ファイル（md 内の相対リンク・ADR-0019） ===== */
// path はマイドライブからの相対。フォルダを指していたら、その中の README.md を返す
export async function findByPath(path: string): Promise<DFile | null> {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  const dir = parts.length ? await resolvePath(parts.join('/')) : await getRootId();
  if (!dir || !name) return null;
  const q = `'${dir}' in parents and name='${qName(name)}' and trashed=false`;
  const d = await api<{ files: Raw[] }>('files?' + new URLSearchParams({ q, pageSize: '1', fields: `files(${FIELDS})` }));
  if (!d.files.length) return null;
  const f = norm(d.files[0]);
  if (f.mimeType !== FOLDER) return f;
  const r = await api<{ files: Raw[] }>(
    'files?' +
      new URLSearchParams({
        q: `'${f.id}' in parents and name='README.md' and trashed=false`,
        pageSize: '1',
        fields: `files(${FIELDS})`,
      }),
  );
  return r.files.length ? norm(r.files[0]) : null;
}

/* ===== 最近（ADR-0016） ===== */
// scopeId が null ならマイドライブ全体。範囲に絞り、除外を捨てた結果を返す
export async function listRecent(scopeId: string | null, { want = 40, maxPages = 5 } = {}): Promise<DFile[]> {
  await getRootId();
  const out: DFile[] = [];
  let tok: string | undefined;
  for (let p = 0; p < maxPages; p++) {
    const params: Record<string, string> = {
      q: `trashed=false and mimeType!='${FOLDER}'`,
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      fields: `nextPageToken,files(${FIELDS})`,
    };
    if (tok) params.pageToken = tok;
    const d = await api<{ files: Raw[]; nextPageToken?: string }>('files?' + new URLSearchParams(params));
    const fs = d.files.map(norm);
    await resolveAncestors(fs);
    for (const f of fs) {
      const c = chainOf(f);
      if (scopeId && !c.includes(scopeId)) continue;
      if (c.some((id) => EXCLUDE.has(dirs.get(id)?.name ?? ''))) continue;
      f.path = relPath(c, scopeId);
      out.push(f);
    }
    tok = d.nextPageToken;
    if (out.length >= want || !tok) break;
  }
  return out;
}

/* ===== ツリー ===== */
const byName = (a: DFile, b: DFile) => a.name.localeCompare(b.name, 'ja');
export type Kids = { folders: DFile[]; files: DFile[] };
// フォルダ直下。フォルダが先（名前順）、ファイルは更新の新しい順。除外名のフォルダは出さない
export async function listChildren(folderId: string): Promise<Kids> {
  await loadCaches();
  const all: DFile[] = [];
  let tok: string | undefined;
  do {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and trashed=false`,
      pageSize: '1000',
      fields: `nextPageToken,files(${FIELDS})`,
    };
    if (tok) params.pageToken = tok;
    const d = await api<{ files: Raw[]; nextPageToken?: string }>('files?' + new URLSearchParams(params));
    all.push(...d.files.map(norm));
    tok = d.nextPageToken;
  } while (tok);
  const folders = all.filter((f) => f.mimeType === FOLDER && !EXCLUDE.has(f.name)).sort(byName);
  folders.forEach((f) => setDir(f.id, f.name, [folderId]));
  const files = all.filter((f) => f.mimeType !== FOLDER).sort((a, b) => b.t - a.t);
  files.forEach((f) => {
    f.parents = [folderId];
  });
  return { folders, files };
}

/* ===== ファイル ===== */
export async function getMeta(id: string) {
  return norm(await api<Raw>(`files/${id}?fields=${FIELDS}`));
}
export const getVersion = (id: string) =>
  api<{ version: string; modifiedTime: string; size?: string }>(`files/${id}?fields=version,modifiedTime,size`);
export async function fetchText(id: string) {
  return (await check(await call(`${API}files/${id}?alt=media`), 'media')).text();
}
// 本文を上書きする。返り値は新しい version など
export async function saveText(id: string, text: string, mimeType?: string) {
  const r = await call(`${UPLOAD}files/${id}?uploadType=media&fields=version,modifiedTime,size`, {
    method: 'PATCH',
    headers: { 'Content-Type': mimeType || 'text/plain;charset=utf-8' },
    body: text,
  });
  return (await check(r, 'upload')).json() as Promise<{ version: string; modifiedTime: string; size?: string }>;
}

export const contentUrl = (id: string) => `${API}files/${id}?alt=media`;

// 画像・動画・音声の読み込み元（認証ヘッダ付き）。残り minLeft を切っていれば新しいトークンにする
export async function authHeaders(minLeft = 0) {
  return { Authorization: 'Bearer ' + (await accessToken(minLeft)) };
}

// PDF などをキャッシュのファイルへ落とす。返り値はローカルの file:// パス
export async function downloadToCache(f: DFile, ext: string, version: string): Promise<string> {
  await ensureDir();
  const path = bodyPath(f.id, ext);
  if (DRIVE_MOCK) {
    await FileSystem.writeAsStringAsync(path, mockPdf);
  } else {
    const run = async (t: string) =>
      FileSystem.downloadAsync(contentUrl(f.id), path, { headers: { Authorization: 'Bearer ' + t } });
    let r = await run(await accessToken());
    if (r.status === 401) r = await run(await forceRefresh());
    if (r.status < 200 || r.status >= 300) {
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
      throw new DriveError(`Drive ${r.status} media`, r.status);
    }
  }
  await registerBody(f.id, version, path);
  return path;
}
