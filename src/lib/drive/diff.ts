// 3方向マージ（ADR-0014）。drive-viewer の diff.js の移植
export type Chunk =
  | { t: 'same'; lines: string[] }
  | { t: 'theirs' | 'mine' | 'both'; base: string[]; lines: string[] }
  | { t: 'conflict'; base: string[]; mine: string[]; theirs: string[]; pick: 'theirs' | 'mine' | 'both' };

// 行単位の最長共通部分列。a[i] と対応する b の添字を返す（無ければ -1）
export function lcsMatch(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const match = new Array<number>(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      match[i] = j;
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
    else j++;
  }
  return match;
}
const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);

// base を基準に mine と theirs を突き合わせ、塊に分ける
export function diff3(base: string[], mine: string[], theirs: string[]): Chunk[] {
  const mb = lcsMatch(base, mine);
  const tb = lcsMatch(base, theirs);
  const out: Chunk[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < base.length || j < mine.length || k < theirs.length) {
    let a = i;
    while (a < base.length && !(mb[a] >= j && tb[a] >= k)) a++;
    const je = a < base.length ? mb[a] : mine.length;
    const ke = a < base.length ? tb[a] : theirs.length;
    if (a === i && je === j && ke === k) {
      out.push({ t: 'same', lines: [base[i]] });
      i++;
      j++;
      k++;
      continue;
    }
    const B = base.slice(i, a);
    const M = mine.slice(j, je);
    const Th = theirs.slice(k, ke);
    if (same(M, B)) out.push({ t: 'theirs', base: B, lines: Th });
    else if (same(Th, B)) out.push({ t: 'mine', base: B, lines: M });
    else if (same(M, Th)) out.push({ t: 'both', base: B, lines: M });
    else out.push({ t: 'conflict', base: B, mine: M, theirs: Th, pick: 'both' });
    i = a;
    j = je;
    k = ke;
  }
  return out;
}

export function mergedText(chunks: Chunk[]): string {
  return chunks
    .flatMap((c) =>
      c.t === 'same' || c.t !== 'conflict'
        ? c.lines
        : c.pick === 'mine'
          ? c.mine
          : c.pick === 'theirs'
            ? c.theirs
            : [...c.theirs, ...c.mine],
    )
    .join('\n');
}
