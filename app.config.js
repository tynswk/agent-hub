// OTA (expo-updates) の配信先 URL を環境変数から注入する。
// public リポジトリに Tailscale ホスト名を書かないための薄いラッパー。
const base = require('./app.json').expo;

const apiBase = (process.env.EXPO_PUBLIC_API_BASE || '').trim().replace(/\/+$/, '');
const isHttps = apiBase.startsWith('https://');

module.exports = {
  ...base,
  runtimeVersion: '1',
  updates: isHttps
    ? {
        url: `${apiBase}/api/ota/manifest`,
        enabled: true,
        checkAutomatically: 'ON_LOAD',
        fallbackToCacheTimeout: 2500,
      }
    : {
        enabled: false,
      },
};
