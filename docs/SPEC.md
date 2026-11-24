# Agent Hub ネイティブ版 仕様メモ（v1.0.0）

移植元・方針の正は `G:\マイドライブ\AI_Agents\dev\agent-hub-native\PORTING.md`。ここには実装で決めたことと API の注意点だけを書く。

## 構成

- `src/app/_layout.tsx`：ルート。Stack の中に `(tabs)`（ピル型タブバー）と、formSheet の `manual`（手入力・編集・カテゴリー確認）、`review`（要確認のレシート）。
- `src/app/(tabs)/`：セッション・家計簿・Drive。タブは横スワイプで切り替わらない（タブバーのタップ／ドラッグのみ）。
- `src/lib/api.ts`：通信。`EXPO_PUBLIC_API_BASE`、モック切替 `EXPO_PUBLIC_MOCK_WRITES=1`。
- `src/lib/local.ts`：端末側の控え（expo-sqlite）と再送。`src/lib/kakeibo.ts`：型・集計の補助・クエリ・小さなストア。
- `src/app/session-new.tsx`（新規セッション）、`src/app/limit.tsx`（AI 上限の詳細、`detents [0.3]`）も formSheet。`src/lib/sessions.ts`：型・クエリ・ストア（`sessUi`：操作中の行と起動中の仮の行、`limSheet`）・再開/停止/起動の処理。`src/lib/models.ts`：モデル/エフォート一覧（PWA の app.js と同じ）。
- 共通部品（`src/components`）：`Press`（押下ハイライト）、`GlassMenu`、`PillSegment`、`Toast`（`toast()` はどこからでも呼べる）、`Loader`、`SheetHeader`、`SwipeRow`、`Form`。

## 環境変数

| 変数 | 内容 |
|---|---|
| `EXPO_PUBLIC_API_BASE` | pwa_api の URL。IPA は Actions の secret `API_BASE`、Expo Go は `.env.local`（gitignore）。エミュレータからは `http://10.0.2.2:8768` |
| `EXPO_PUBLIC_DRIVE_MOCK` | `1` のとき Drive の認証と API をモックに差し替える（`EXPO_PUBLIC_DRIVE_MOCK_SHORT=1` でトークン寿命を短く）。CI には渡さない |
| `EXPO_PUBLIC_MOCK_WRITES` | `1` のとき書き込み系（POST/PUT/DELETE、レシート送信、セッションの start/resume/stop）をネットワークに出さず、成功応答をローカルで返す。**CI には渡さない（本番）** |

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

## セッションタブ（段3）

- 一覧は `ScrollView` に全行を並べ、各行に reanimated の `LinearTransition`（0.24 秒）を付ける。SectionList にしないのは、グループ間の移動を「同じ行がスライドする」形にするため（SectionList は別セクションへ移ると再マウントされる）。105 件程度なら支障なし。
- 行の所属は `pending[kind:id] ?? running`（操作開始時の状態）。操作が終わって再取得し、`pending` を外した瞬間にグループが替わる（PWA と同じ）。
- 30 秒ごとの一覧再取得・5 分ごとの上限再取得は、タブが前面（`useFocusEffect`）かつ AppState が active のときだけ。
- 上限の 4 枠はヘッダのタイトル位置に横一列（仕様 v0.32。バーの高さは変えない。名前、円、系の順。円 22px）。円は react-native-svg。20% 以下は琥珀、0% は赤、取れない枠は「—」。
- 新規開始：シートを閉じてから `beginSession`。実行中の先頭に仮の行（`isNew`）を出し、`startSession` の完了後に再取得して外す。起動中は ＋ を無効にする。添付ありは `uploadAsync`（MULTIPART、field `file`、他は `kind/model/effort/prompt`）。
- モック：`/api/sessions` の読み取りに重ねる（resume=実行中、stop=停止中、start=一覧に行を追加）。start のモックは 2.2 秒待って仮の行を見せる。
- セッション画面の `'use no memo'` は v1.0.0 で外した（段5）。Android（Expo Go）で一覧・停止/再開・タブ往復を確認し、フックの順序エラーは再現しなかった。iOS 実機は未確認。Drive 側の `drive.tsx` / `viewer.tsx` / `Bodies.tsx` / `DocViewer.tsx` / `MdView.tsx` は WebView・動画まわりの回避として `'use no memo'` のまま。
- 添付は expo-image-picker（ライブラリ）と expo-document-picker（Expo Go 同梱）。Android エミュレータでは添付メニューの選択画面までは見ていない。

## API の注意点

- 更新・削除は `POST /api/kakeibo/entries/{id}/update|delete` を使う（PUT/DELETE は使わない。PWA の Service Worker 事情の名残だが、そのまま揃える）。
- `POST /api/kakeibo/entries` は `category: "auto"` で分類できないと `{ok:false, needs_category:true}` を返す（登録されない）。この場合は「要確認」行にして、チップで選んだ ID で同じ mid を再送する。
- レシートの `confirm` の日付は `YYYY/MM/DD`。手入力の日付は `YYYY-MM-DD`（`/` でも受ける）。
- iPhone では Tailscale がつながっている必要がある（IPA の接続先は Tailscale の https URL）。

## 未実装・次段

- `GlassMenu` はセッションの新規シート（モデル・エフォート・添付）で使用。メニューが画面より長い場合のスクロールは未対応（Gemini の 11 件は 1920px 高で収まる）。
- TanStack Query の永続化（アプリ再起動後に前回の表示を出す）は未実装。メモリ上のキャッシュのみ。
- iOS 実機（formSheet、標準日付ピッカー、haptics）は未確認。

## Drive タブ（段4）

- ログイン方式は drive-viewer の ADR-0027 を参照。redirect_uri は `https://tynswk.github.io/drive-viewer/` 固定、state は `n1.<戻り先URLのbase64url>.<乱数>`（戻り先は `Linking.createURL('drive-auth')`）。ASWebAuthenticationSession（ephemeral）で開き、Worker `/exchange`・`/refresh` へは `X-Client: agenthub` を付け Origin は付けない。トークンは expo-secure-store。
- 状態は `src/lib/drive/`：`auth.ts`（ログイン・更新・ログアウト）、`api.ts`（drive.js の移植）、`data.ts`（範囲・ピン留め・最近・ツリー）、`cache.ts`（本文は cacheDirectory に合計150MB・1件30MB）、`media.tsx`（アプリに1つのプレーヤー）、`diff.ts`（3方向マージ）。
- 最近：範囲は祖先からクライアント側で判定。前面の間だけ15秒ごとに先頭ページを見て「新着 N 件」。ツリー：開いたフォルダの中身を平らにした FlashList。フォルダ長押しで GlassMenu（ピン留め）。ピンは AsyncStorage `dv_pins`（ログアウトでも残す）。
- ビューアは `/viewer?id=`（iOS は formSheet、Android は modal）。md は react-native-marked（相対リンクは baseUrl `dvrel:` を付けて判別し、findByPath で開く）。保存は PATCH、版が変わっていれば MergeModal。HTML は WebView（`originWhitelist=['*']` ＋ onShouldStartLoadWithRequest で about:/data: 以外を止める。許可リストを about:blank だけにすると RN が外部ブラウザへ渡してしまうため）。PDF は iOS のみ WebView（file://）、Android は「Driveで開く」。
- 動画・音声：expo-video。ヘッダ付き VideoSource。残り5分を切ったら新しいトークンで再生元を作り直し、位置・速度を引き継ぐ。ミニプレーヤーは (tabs)/_layout に置きタブをまたいで残る。
- ディープリンク：`agenthub://drive?path=…` / `?id=…`（id 優先）。未ログインなら params を保持し、ログイン後に開く。
- 確認用モック：`EXPO_PUBLIC_DRIVE_MOCK=1`。
- 更新の追従：ビューアを開いている間15秒ごとに版を確認し、変わっていれば自動で再読込（編集中はトーストだけ）。Toast に操作ボタンが無いため PWA の「再読込」ボタンは置いていない。

## 仕上げ（段5・v1.0.0）

- **モックは本番バンドルに入らない**：`process.env.EXPO_PUBLIC_DRIVE_MOCK === '1'` / `EXPO_PUBLIC_MOCK_WRITES === '1'` を使う場所で直接比較し、モック本体（`src/lib/drive/mock.ts`、`src/lib/apiMock.ts`、`assets/mock/sample.mp4`）は分岐の中で `require` する。env なしの `npx expo export --platform ios` で、バンドルと assets に mock 本体・sample.mp4 が無いことを確認した（Hermes バイトコードにはプロパティ名の文字列だけ残る）。
- **クイックアクション「撮影」**：`expo-quick-actions`。静的な項目は config plugin（`iosActions`）で Info.plist の `UIApplicationShortcutItems` に入る（SF Symbol `camera`）。起動処理は `src/lib/quickActions.ts`（`(tabs)/_layout` で呼ぶ）。Expo Go（`Constants.appOwnership === 'expo'`）では読み込まず、`require` 失敗も握りつぶす。押すと家計簿タブへ移動して `capture(false)`（`src/lib/capture.ts`）でカメラを起動。
- **iPad**：`(tabs)/_layout` で列を最大 720pt・中央寄せ（ピルバー・ミニプレーヤー・各ヘッダもこの列の中）。シートは formSheet なので iPad では OS が幅を決める。
- **Drive の新着ピル**：検索欄の下（先頭行の上）に浮かべる。
- モデル名が `<` で始まる内部値（`<synthetic>` 等）は一覧に出さない。
- ダークモードは全画面を目視して、theme.ts の変更は不要だった。
