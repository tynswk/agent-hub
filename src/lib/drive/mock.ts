// EXPO_PUBLIC_DRIVE_MOCK=1 のときだけ使う Drive API のモック。fetch の代わりに呼ばれ、本物と同じ形の応答を返す。
// 本人の Drive には一切つながらない。保存（PATCH）もここの中で完結する。
const FOLDER = 'application/vnd.google-apps.folder';
const NOW = Date.now();
const min = 60e3;
const hour = 60 * min;
// 版は起動ごとに別の値から始める（前回起動の本文キャッシュと食い違わないように）
const V0 = NOW;
const day = 24 * hour;

type MFile = {
  id: string;
  name: string;
  mimeType: string;
  t: number;
  size?: number;
  version: number;
  parents: string[];
  body?: string;
  asset?: 'video' | 'image' | 'audio' | 'pdf';
};

const MD_README = `# drive-viewer

スマホで Drive のファイルを見るための PWA。

- 設計は [DESIGN.md](DESIGN.md) を参照
- 移植メモは [../agent-hub/SPEC.md](../agent-hub/SPEC.md)
- 存在しないファイルへのリンクは [これ](./nothing.md)
- 外部リンクは [Google](https://www.google.com/)

## 表

| 項目 | 状態 | 備考 |
|---|---|---|
| 最近 | 完了 | 15 秒ごとに新着確認 |
| ツリー | 完了 | 長押しでピン留め |
| 動画 | 確認中 | 速度チップあり |

## コード

\`\`\`python
def merge(base, mine, theirs):
    return diff3(base, mine, theirs)
\`\`\`

インラインの \`code\` も使える。

> 引用は左に線が付く

1. 番号付き
2. リスト
   - 入れ子
`;

const MD_DESIGN = `# 設計

## 全体

最近の一覧・ツリー・ビューア・ミニプレーヤーの 4 つで構成する。

戻るには [README](README.md) へ。

## 色

- 地：白／黒
- 強調：琥珀 1 色
`;

const MD_SPEC = `# agent-hub SPEC

段4：Drive タブ。

[drive-viewer の README](../drive-viewer/README.md) も見る。
`;

const MD_CONFLICT = `# 衝突テスト

1行目：ここは自分が書き換える
2行目：変更なし
3行目：変更なし
4行目：変更なし
5行目：変更なし
6行目：変更なし
7行目：変更なし
8行目：他端末が書き換える
9行目：変更なし
10行目：変更なし
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;padding:24px;background:#fff7e6"><h1 id="t">HTML の描画</h1>
<p>スクリプトは動く：<span id="s">未実行</span></p>
<a href="https://example.com/">外部リンク（アプリ内では遷移しない）</a>
<script>document.getElementById('s').textContent='実行済み';</script></body></html>`;

const PDF = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 24 Tf 40 100 Td (Sample PDF) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`;

const files = new Map<string, MFile>();
let seq = 0;
function dir(id: string, name: string, parent: string) {
  files.set(id, { id, name, mimeType: FOLDER, t: NOW - 30 * day, version: V0, parents: [parent] });
}
function file(
  parent: string,
  name: string,
  mimeType: string,
  ago: number,
  body?: string,
  asset?: MFile['asset'],
  size?: number,
) {
  const id = `m${++seq}`;
  files.set(id, {
    id,
    name,
    mimeType,
    t: NOW - ago,
    size: size ?? (body ? body.length : 5_000_000),
    version: V0,
    parents: [parent],
    body,
    asset,
  });
  return id;
}

dir('root', 'マイドライブ', '');
files.get('root')!.parents = [];
dir('d_ai', 'AI_Agents', 'root');
dir('d_dev', 'dev', 'd_ai');
dir('d_dv', 'drive-viewer', 'd_dev');
dir('d_ah', 'agent-hub', 'd_dev');
dir('d_scripts', 'scripts', 'd_dev');
dir('d_mem', 'memory', 'd_ai');
dir('d_media', 'media', 'd_ai');
dir('d_nm', 'node_modules', 'd_ai');
dir('d_photo', '写真', 'root');
dir('d_doc', 'ドキュメント', 'root');
dir('d_empty', '空のフォルダ', 'root');

const TXT = 'text/plain';
const MD = 'text/markdown';
file('d_dv', 'README.md', MD, 2 * min, MD_README);
file('d_dv', 'DESIGN.md', MD, 3 * hour, MD_DESIGN);
file('d_ah', 'SPEC.md', MD, 8 * min, MD_SPEC);
file('d_ah', '衝突テスト.md', MD, 25 * min, MD_CONFLICT);
file('d_scripts', 'run.py', 'text/x-python', 40 * min, 'import sys\n\nprint("hello", sys.argv)\n');
file('d_scripts', 'config.json', 'application/json', 5 * hour, '{\n  "scope": "AI_Agents",\n  "limit": 40\n}\n');
file('d_mem', 'MEMORY.md', MD, 26 * hour, '# MEMORY\n\n- 項目 1\n- 項目 2\n');
file('d_mem', 'user-profile.md', MD, 2 * day, '# プロフィール\n\nモックの内容。\n');
file('d_mem', 'feedback-tone.md', MD, 4 * day, '# 語り口\n\n率直に。\n');
file('d_media', 'sample.mp4', 'video/mp4', 12 * min, undefined, 'video');
file('d_media', '録音メモ.m4a', 'audio/mp4', 70 * min, undefined, 'audio');
file('d_media', 'photo.jpg', 'image/jpeg', 4 * hour, undefined, 'image');
file('d_media', 'report.pdf', 'application/pdf', 30 * hour, undefined, 'pdf');
file('d_media', 'page.html', 'text/html', 6 * hour, HTML);
file('d_media', 'huge.log', TXT, 3 * day, 'x', undefined, 12 * 1048576);
file('d_media', 'sheet.gsheet', 'application/vnd.google-apps.spreadsheet', 9 * day);
file('d_nm', 'ignored.js', 'text/javascript', 1 * min, 'ignored');
file('d_photo', 'IMG_0001.jpg', 'image/jpeg', 6 * day, undefined, 'image');
file('d_doc', 'レポート.txt', TXT, 10 * day, 'レポートの下書き\n');
file('d_doc', '履歴書.pdf', 'application/pdf', 20 * day, undefined, 'pdf');
file('root', 'メモ.txt', TXT, 50 * hour, 'マイドライブ直下のメモ\n');
file('root', 'とても長いファイル名のドキュメントでおしまいまで表示されるかを確かめる用.md', MD, 7 * hour, '# 長い名前\n');
for (let i = 1; i <= 8; i++) file('d_doc', `memo-${i}.txt`, TXT, (11 + i) * day, `メモ ${i}\n`);

// 数十秒後に、別の端末で新規作成されたファイルが現れる（新着ピルの確認用）
setTimeout(() => {
  file('d_dv', '新着ノート.md', MD, 0, '# 新着\n\n別の端末で作られた。\n');
}, 45e3);

export const mockAssets = {
  video: () => require('../../../assets/mock/sample.mp4') as number,
  audio: () => require('../../../assets/mock/sample.mp4') as number,
  image: () => require('../../../assets/bg.jpg') as number,
};
export const mockPdf = PDF;
export const mockAssetKind = (id: string) => files.get(id)?.asset;

// 衝突の確認用：編集を始めて数秒後に、別の端末が 8 行目を書き換えたことにする
export function mockOnEdit(id: string) {
  const f = files.get(id);
  if (!f || f.name !== '衝突テスト.md') return;
  setTimeout(() => {
    f.body = (f.body ?? '').replace('8行目：他端末が書き換える', '8行目：他端末が書き換えた');
    f.version += 1;
    f.t = Date.now();
  }, 4000);
}

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function pick(f: MFile, fields: string) {
  const out: Record<string, unknown> = {};
  for (const k of fields.replace(/files\(|\)|nextPageToken,?/g, '').split(',')) {
    if (k === 'id') out.id = f.id;
    else if (k === 'name') out.name = f.name;
    else if (k === 'mimeType') out.mimeType = f.mimeType;
    else if (k === 'modifiedTime') out.modifiedTime = new Date(f.t).toISOString();
    else if (k === 'size' && f.mimeType !== FOLDER) out.size = String(f.size ?? 0);
    else if (k === 'version') out.version = String(f.version);
    else if (k === 'parents') out.parents = f.parents;
  }
  return out;
}

const unq = (s: string) => s.replace(/\\(.)/g, '$1');

export async function mockFetch(url: string, init: RequestInit = {}): Promise<Response> {
  await new Promise((r) => setTimeout(r, 90));
  const u = new URL(url);
  const path = u.pathname;
  const sp = u.searchParams;
  const method = (init.method ?? 'GET').toUpperCase();

  let m = path.match(/\/upload\/drive\/v3\/files\/([^/]+)$/);
  if (m && method === 'PATCH') {
    const f = files.get(m[1]);
    if (!f) return j({}, 404);
    f.body = String(init.body ?? '');
    f.version += 1;
    f.t = Date.now();
    f.size = f.body.length;
    return j(pick(f, 'version,modifiedTime,size'));
  }
  if (path.endsWith('/drive/v3/files') && method === 'GET') {
    const q = sp.get('q') ?? '';
    const fields = sp.get('fields') ?? '';
    let list = [...files.values()].filter((f) => f.id !== 'root');
    const par = q.match(/'([^']+)' in parents/);
    if (par) list = list.filter((f) => f.parents.includes(par[1]));
    const nm = q.match(/name='((?:\\.|[^'\\])*)'/);
    if (nm) list = list.filter((f) => f.name === unq(nm[1]));
    if (q.includes(`mimeType='${FOLDER}'`)) list = list.filter((f) => f.mimeType === FOLDER);
    if (q.includes(`mimeType!='${FOLDER}'`)) list = list.filter((f) => f.mimeType !== FOLDER);
    if (sp.get('orderBy') === 'modifiedTime desc') list.sort((a, b) => b.t - a.t);
    const size = Number(sp.get('pageSize') ?? 100);
    const from = Number(sp.get('pageToken') ?? 0);
    const page = list.slice(from, from + size);
    const next = from + size < list.length ? String(from + size) : undefined;
    return j({ files: page.map((f) => pick(f, fields)), nextPageToken: next });
  }
  m = path.match(/\/drive\/v3\/files\/([^/]+)$/);
  if (m && method === 'GET') {
    const f = files.get(m[1]);
    if (!f) return j({}, 404);
    if (sp.get('alt') === 'media') return new Response(f.body ?? '', { status: 200 });
    return j(pick(f, sp.get('fields') ?? 'id,name'));
  }
  return j({}, 404);
}
