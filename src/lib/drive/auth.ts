// Drive のログイン（認可コード＋PKCE。交換と更新は Worker）。方式は drive-viewer の ADR-0027。
// トークンは iOS のキーチェーン（expo-secure-store）。EXPO_PUBLIC_DRIVE_MOCK=1 のときは認証もモックに差し替える。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createStore } from '@/lib/kakeibo';

export const DRIVE_MOCK = process.env.EXPO_PUBLIC_DRIVE_MOCK === '1';
// モックのトークンの寿命。SHORT=1 だと残り5分を切る再生元の作り直しがすぐ起きる（確認用）
const MOCK_LIFE = process.env.EXPO_PUBLIC_DRIVE_MOCK_SHORT === '1' ? 340e3 : 3600e3;

const CLIENT_ID = '591925567747-l2hgpfep4qvme7c5tdhh9mnal8nub2h1.apps.googleusercontent.com';
const WORKER = 'https://drive-viewer-auth.tynswk.workers.dev';
export const REDIRECT = 'https://tynswk.github.io/drive-viewer/';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const K_REFRESH = 'dv_refresh_token';
const K_ACCESS = 'dv_access_token';
const K_EXP = 'dv_access_exp';
// ログアウトで消す端末キャッシュ（ピン留め dv_pins・範囲 dv_scope は残す）
const CACHE_PREFIXES = ['dv_r:', 'dv_k:', 'dv_dirs', 'dv_root', 'dv_paths', 'dv_bodies'];

export const authStore = createStore({ status: 'loading' as 'loading' | 'out' | 'in' });

let access = '';
let accessExp = 0;
let refreshToken = '';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function b64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

export async function initAuth() {
  if (DRIVE_MOCK) {
    const on = (await AsyncStorage.getItem('dv_mock_in')) !== '0';
    if (on) {
      access = 'mock-token';
      accessExp = Date.now() + MOCK_LIFE;
    }
    authStore.set({ status: on ? 'in' : 'out' });
    return;
  }
  try {
    refreshToken = (await SecureStore.getItemAsync(K_REFRESH)) ?? '';
    access = (await SecureStore.getItemAsync(K_ACCESS)) ?? '';
    accessExp = Number((await SecureStore.getItemAsync(K_EXP)) ?? 0);
  } catch {
    refreshToken = '';
  }
  authStore.set({ status: refreshToken ? 'in' : 'out' });
}

export const isAuthed = () => authStore.get().status === 'in';

async function saveAccess(token: string, expiresIn: number) {
  access = token;
  accessExp = Date.now() + (expiresIn - 60) * 1000;
  await SecureStore.setItemAsync(K_ACCESS, access);
  await SecureStore.setItemAsync(K_EXP, String(accessExp));
}

// ログインの URL と state を組み立てる（確認用に分けてある）
export async function buildAuthRequest() {
  const back = Linking.createURL('drive-auth');
  const verifier = b64url(await Crypto.getRandomBytesAsync(32));
  const challengeB64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = challengeB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rand = b64url(await Crypto.getRandomBytesAsync(12));
  const state = `n1.${b64url(new TextEncoder().encode(back))}.${rand}`;
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString(), back, verifier, state };
}

async function workerPost(path: string, body: unknown) {
  // ネイティブは Origin を付けず、X-Client で識別する（Worker 側の取り決め）
  const r = await fetch(WORKER + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'agenthub' },
    body: JSON.stringify(body),
  });
  return (await r.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

// ログインを開く。成功したら true、キャンセルは false
export async function login(): Promise<boolean> {
  if (DRIVE_MOCK) {
    // モックは Google を開かず、認可 URL の組み立てだけ確かめて即ログインにする
    const req = await buildAuthRequest();
    console.log('[drive-auth] authUrl', req.url);
    console.log('[drive-auth] back', req.back);
    if (process.env.EXPO_PUBLIC_DRIVE_MOCK_OPEN === '1') {
      await WebBrowser.openAuthSessionAsync(req.url, req.back, { preferEphemeralSession: true });
      return false;
    }
    await AsyncStorage.setItem('dv_mock_in', '1');
    access = 'mock-token';
    accessExp = Date.now() + MOCK_LIFE;
    authStore.set({ status: 'in' });
    return true;
  }
  const req = await buildAuthRequest();
  const res = await WebBrowser.openAuthSessionAsync(req.url, req.back, { preferEphemeralSession: true });
  if (res.type !== 'success') return false;
  const q = Linking.parse(res.url).queryParams ?? {};
  if (q.state !== req.state) throw new Error('state 不一致');
  const code = typeof q.code === 'string' ? q.code : '';
  if (!code) throw new Error('認可コードがありません');
  const d = await workerPost('/exchange', { code, code_verifier: req.verifier, redirect_uri: REDIRECT });
  if (!d.refresh_token || !d.access_token) throw new Error('交換失敗');
  refreshToken = d.refresh_token;
  await SecureStore.setItemAsync(K_REFRESH, refreshToken);
  await saveAccess(d.access_token, d.expires_in ?? 3600);
  authStore.set({ status: 'in' });
  return true;
}

let refreshing: Promise<string> | null = null;
function refresh(): Promise<string> {
  refreshing ??= (async () => {
    if (DRIVE_MOCK) {
      access = 'mock-token-' + Date.now();
      accessExp = Date.now() + (MOCK_LIFE === 340e3 ? 330e3 : 3600e3);
      return access;
    }
    if (!refreshToken) throw new Error('未ログイン');
    const d = await workerPost('/refresh', { refresh_token: refreshToken });
    if (!d.access_token) throw new Error('更新失敗');
    await saveAccess(d.access_token, d.expires_in ?? 3600);
    return access;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// minLeft：期限までこれだけ（ms）残っていなければ取り直す
export async function accessToken(minLeft = 0): Promise<string> {
  if (access && Date.now() + minLeft < accessExp) return access;
  return refresh();
}
export const forceRefresh = () => refresh();
export const tokenLeftMs = () => accessExp - Date.now();

export async function logout() {
  access = '';
  accessExp = 0;
  refreshToken = '';
  if (DRIVE_MOCK) await AsyncStorage.setItem('dv_mock_in', '0');
  else {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(K_REFRESH),
      SecureStore.deleteItemAsync(K_ACCESS),
      SecureStore.deleteItemAsync(K_EXP),
    ]);
  }
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p))));
  if (FileSystem.cacheDirectory) {
    await FileSystem.deleteAsync(FileSystem.cacheDirectory + 'drive/', { idempotent: true }).catch(() => undefined);
  }
  authStore.set({ status: 'out' });
}
