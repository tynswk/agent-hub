'use no memo';
// 動画・音声。プレーヤーはアプリに1つだけ持ち、ビューアを閉じても再生を続ける（ミニプレーヤーが操作する）。
// トークン期限の残りが5分を切ったら、新しいトークンで再生元を作り直し、同じ位置・速度で続ける。
import { type VideoPlayer, type VideoSource, useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { toast } from '@/components/Toast';
import { type DFile, authHeaders, contentUrl } from '@/lib/drive/api';
import { DRIVE_MOCK, forceRefresh, tokenLeftMs } from '@/lib/drive/auth';
import { mockAssets } from '@/lib/drive/mock';
import { createStore } from '@/lib/kakeibo';

// 再生中のファイルIDだけ（一覧の行が毎回再描画されないよう、時刻の更新とは分ける）
export const nowPlaying = createStore({ id: '' });

export const REBUILD_LEFT_MS = 5 * 60e3;

export const media = createStore({
  file: null as DFile | null,
  player: null as VideoPlayer | null,
  playing: false,
  time: 0,
  duration: 0,
  rate: 1,
  viewerOpen: false,
  rebuilds: 0,
});

async function sourceOf(f: DFile): Promise<VideoSource> {
  const metadata = { title: f.name };
  if (DRIVE_MOCK) return { assetId: f.mimeType.startsWith('audio/') ? mockAssets.audio() : mockAssets.video(), metadata };
  return { uri: contentUrl(f.id), headers: await authHeaders(REBUILD_LEFT_MS), metadata };
}

function whenReady(p: VideoPlayer, ms = 8000) {
  return new Promise<void>((resolve) => {
    if (p.status === 'readyToPlay') return resolve();
    const sub = p.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' || status === 'error') done();
    });
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      sub.remove();
      resolve();
    }
  });
}

export async function openMedia(f: DFile) {
  const { player, file } = media.get();
  if (!player || file?.id === f.id) return;
  media.set({ file: f, time: 0, duration: 0, playing: false, rate: 1 });
  nowPlaying.set({ id: f.id });
  try {
    await player.replaceAsync(await sourceOf(f));
    player.playbackRate = 1;
    player.play();
  } catch (e) {
    console.warn('media', e);
    toast('再生できませんでした');
  }
}
export function stopMedia() {
  const { player } = media.get();
  media.set({ file: null, playing: false, time: 0, duration: 0 });
  nowPlaying.set({ id: '' });
  if (!player) return;
  player.pause();
  void player.replaceAsync(null).catch(() => undefined);
}
export function togglePlay() {
  const p = media.get().player;
  if (!p) return;
  if (p.playing) p.pause();
  else p.play();
}
export function setRate(r: number) {
  const p = media.get().player;
  if (p) p.playbackRate = r;
  media.set({ rate: r });
}
export function seekTo(t: number) {
  const p = media.get().player;
  if (p) p.currentTime = Math.max(0, t);
  media.set({ time: t });
}

let rebuilding = false;
// 新しいトークンで再生元を作り直す。位置・速度・再生状態は引き継ぐ
export async function rebuildSource() {
  const { player, file } = media.get();
  if (!player || !file || rebuilding) return;
  rebuilding = true;
  try {
    const t = player.currentTime;
    const rate = player.playbackRate;
    const was = player.playing;
    await forceRefresh();
    await player.replaceAsync(await sourceOf(file));
    await whenReady(player);
    player.currentTime = t;
    player.playbackRate = rate;
    if (was) player.play();
    media.set({ rebuilds: media.get().rebuilds + 1 });
    console.log('[media] rebuilt at', t.toFixed(1), 'rate', rate);
  } catch (e) {
    console.warn('rebuild', e);
  } finally {
    rebuilding = false;
  }
}

// ルートに1つだけ置く
export function MediaHost() {
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.timeUpdateEventInterval = 0.5;
    p.preservesPitch = true;
  });
  useEffect(() => {
    media.set({ player });
    const a = player.addListener('playingChange', ({ isPlaying }) => media.set({ playing: isPlaying }));
    const b = player.addListener('timeUpdate', ({ currentTime }) =>
      media.set({ time: currentTime, duration: player.duration }),
    );
    const c = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') toast('再生できませんでした');
      if (status === 'readyToPlay') media.set({ duration: player.duration });
    });
    const timer = setInterval(() => {
      if (media.get().file && tokenLeftMs() < REBUILD_LEFT_MS) void rebuildSource();
    }, 20_000);
    return () => {
      a.remove();
      b.remove();
      c.remove();
      clearInterval(timer);
    };
  }, [player]);
  return null;
}
