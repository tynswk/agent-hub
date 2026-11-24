// ui.js / kind.js の小物。時刻表示・グループ・サイズ・種別
import type { DFile } from '@/lib/drive/api';

const day = 86400e3;
export function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '今';
  if (s < 3600) return Math.floor(s / 60) + '分前';
  const d = new Date(t);
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  if (t >= d0.getTime()) return Math.floor(s / 3600) + '時間前';
  if (t >= d0.getTime() - day) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
export const freshness = (t: number): 'fresh' | 'warm' | '' => {
  const s = (Date.now() - t) / 1000;
  return s < 600 ? 'fresh' : s < 3600 ? 'warm' : '';
};
export function groupOf(t: number) {
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const z = d0.getTime();
  if (t >= z) return '今日';
  if (t >= z - day) return '昨日';
  if (t >= z - 6 * day) return '今週';
  return 'それより前';
}
export function fmtSize(n?: number) {
  if (n == null || isNaN(n)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(1) + ' GB';
}
export const mmss = (s: number) =>
  isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '--:--';

// 名前を「拡張子の手前まで」と「拡張子」に分ける（途中を省略して拡張子を残すため）
export function splitName(name: string, folder = false): [string, string] {
  const compound = /(?:\.tar\.(?:gz|bz2|xz|zst)|\.d\.[cm]?ts)$/i.exec(name);
  const at = folder ? -1 : (compound?.index ?? name.lastIndexOf('.'));
  if (at <= 0 || at === name.length - 1) return [name, ''];
  return [name.slice(0, at), name.slice(at)];
}

export type Kind = 'md' | 'code' | 'video' | 'audio' | 'image' | 'pdf' | 'html' | 'other';
const TEXT_EXT = new Set(
  'txt json js mjs ts tsx py sh ps1 bat toml yaml yml csv log css xml ini cfg conf tsv jsonl rs c h cpp go java sql env gitignore tex svg'.split(
    ' ',
  ),
);
export const TEXT_MAX = 10 * 1048576;

export function kindOf(f: Pick<DFile, 'name' | 'mimeType' | 'size'>): Kind {
  const mime = f.mimeType || '';
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (mime.startsWith('application/vnd.google-apps.')) return 'other';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'image/svg+xml') return 'image';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  const big = (f.size ?? 0) > TEXT_MAX;
  if (mime === 'text/html' || ext === 'html' || ext === 'htm') return big ? 'other' : 'html';
  if (mime === 'text/markdown' || ext === 'md' || ext === 'markdown') return big ? 'other' : 'md';
  if (
    mime.startsWith('text/') ||
    ['application/json', 'application/javascript', 'application/xml'].includes(mime) ||
    TEXT_EXT.has(ext)
  ) {
    return big ? 'other' : 'code';
  }
  return 'other';
}
export const EDITABLE = new Set<Kind>(['md', 'code']);
