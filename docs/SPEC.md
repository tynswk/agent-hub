# Agent Hub ネイティブ版 仕様メモ

移植元・方針の正は `G:\マイドライブ\AI_Agents\dev\agent-hub-native\PORTING.md`。ここには実装で決めたことと API の注意点だけを書く。

## 構成（段2時点）

- `src/app/_layout.tsx`：ルート。Stack の中に `(tabs)`（ピル型タブバー）と、formSheet の `manual`（手入力・編集・カテゴリー確認）、`review`（要確認のレシート）。
- `src/app/(tabs)/`：セッション・家計簿・Drive。タブは横スワイプで切り替わらない（タブバーのタップ／ドラッグのみ）。
- `src/lib/api.ts`：通信。`EXPO_PUBLIC_API_BASE`、モック切替 `EXPO_PUBLIC_MOCK_WRITES=1`。
- `src/lib/local.ts`：端末側の控え（expo-sqlite）と再送。`src/lib/kakeibo.ts`：型・集計の補助・クエリ・小さなストア。
- 共通部品（`src/components`）：`Press`（押下ハイライト）、`GlassMenu`、`PillSegment`、`Toast`（`toast()` はどこからでも呼べる）、`Loader`、`SheetHeader`、`SwipeRow`、`Form`。

## 環境変数

| 変数 | 内容 |
|---|---|
| `EXPO_PUBLIC_API_BASE` | pwa_api の URL。IPA は Actions の secret `API_BASE`、Expo Go は `.env.local`（gitignore）。エミュレータからは `http://10.0.2.2:8768` |
| `EXPO_PUBLIC_MOCK_WRITES` | `1` のとき書き込み系（POST/PUT/DELETE、レシート送信、将来のセッション start/resume/stop）をネットワークに出さず、成功応答をローカルで返す。**CI には渡さない（本番）** |

モックは読み取り結果に重ねる方式：追加・編集・削除は端末内のメモリに持ち、`/entries` の応答に反映して表示する（アプリを再起動すると消える）。レシートのモックは `mock_` 始まりの job_id を返し、3 回目のポーリングで done になる。`/pending` は確認済みにしたジョブを除く。

## 決めたこと

- **シートは expo-router の formSheet**。内容は `kkSheet` ストア（モジュール変数）で渡す。ルートのパラメータに行データを載せない。
- **破棄の確認**は `useDiscardGuard`（`beforeRemove`）。入力が初期値から変わっているときだけ。× でも下に引いて閉じるときでも出る。✓ で閉じるときは確認しない。
- **スワイプ削除は自作**（`SwipeRow`：gesture-handler の `usePanGesture` + reanimated）。gesture-handler の Swipeable では「45% 超のフルスワイプで離したら削除」「届いた瞬間の振動」「ボタンが指に合わせて伸びる」を素直に作れないため。開いている行は同時に 1 つ。
- **レシート**：撮影／選択 → expo-image-manipulator で長辺 2400px の JPEG（compress 0.85）→ `documentDirectory/receipts/<key>.jpg` → sqlite `receipts` に記録 → `expo-file-system/legacy` の `uploadAsync`（MULTIPART、field `file`、`job_key`）。job_id を受け取ったら `jobs` に移し、画像と `receipts` の行を消す。ジョブは 3 秒ごと最大 130 回ポーリング。起動時に `jobs` の追跡を再開。
- **再送のきっかけ**：起動時、AppState が active に戻ったとき、NetInfo がオフライン→オンラインになったとき、引っ張ってリロード、「送信待ち」行のタップ。
- **手入力の未達分**は sqlite `manual`（mid・payload・needs_category）。サーバー側の mid による二重登録防止をそのまま使う。
- **カテゴリ送信ルール（編集）**は PWA の `btnSaveManual` と同じ：種別が同じなら `"keep"`、「自動」ON かつ元にカテゴリがあれば `""`、チップで元と違うものを選んだら ID。`edit_preserves_detail` が無い旧 API には `detail` を明示して渡す。
- **mid**は `pwa_` + 16 バイト相当の 16 進（Math.random。冪等キーなので暗号用途の乱数は不要）。
- **月切替**は月ごとにクエリをキャッシュ（`['kk','entries',month]`）。切替直後にキャッシュがあれば前回の表示を出しつつ裏で取り直す。月を変えても前月のデータは出さない。
- 日付ピッカー：iOS は標準のコンパクト表示、Android は標準ダイアログ。

## API の注意点

- 更新・削除は `POST /api/kakeibo/entries/{id}/update|delete` を使う（PUT/DELETE は使わない。PWA の Service Worker 事情の名残だが、そのまま揃える）。
- `POST /api/kakeibo/entries` は `category: "auto"` で分類できないと `{ok:false, needs_category:true}` を返す（登録されない）。この場合は「要確認」行にして、チップで選んだ ID で同じ mid を再送する。
- レシートの `confirm` の日付は `YYYY/MM/DD`。手入力の日付は `YYYY-MM-DD`（`/` でも受ける）。
- iPhone では Tailscale がつながっている必要がある（IPA の接続先は Tailscale の https URL）。

## 未実装・次段

- `GlassMenu` は部品のみ（家計簿画面では使っていない。セッションの新規シートで使う）。
- TanStack Query の永続化（アプリ再起動後に前回の表示を出す）は未実装。メモリ上のキャッシュのみ。
- iOS 実機（formSheet、標準日付ピッカー、haptics）は未確認。
