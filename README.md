# Agent Hub

セッション（Claude / Gemini の起動・停止）・家計簿・Google Drive をまとめて扱う iOS アプリ。Expo SDK 58 / React Native。署名なし IPA を SideStore で配る。

## 開発

```
npm install
npx expo start
```

`.env.local`（gitignore）に書く変数：

- `EXPO_PUBLIC_API_BASE`：pwa_api の URL（Android エミュレータからは `http://10.0.2.2:8768`）
- `EXPO_PUBLIC_MOCK_WRITES=1`：書き込み系をモックにする
- `EXPO_PUBLIC_DRIVE_MOCK=1`：Drive をモックにする

Expo Go で動く。クイックアクションは Expo Go では無効。

## ビルドと公開

main に push すると GitHub Actions が IPA を作る（API の URL は secret `API_BASE`）。成功したら次で SideStore の配信元に載せる。

```
python C:\Users\toyan\sidestore-dist\publish.py
```

仕様と実装メモは `docs/SPEC.md`。
