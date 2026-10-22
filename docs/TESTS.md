# テスト結果

実行日: 2026-10-22 / Chromium (375×812 エミュレート + デスクトップ) / `vite dev` + miniflare (D1 ローカル)

## 1. 単体テスト — `npm test`

```
Test Files  6 passed (6)
     Tests  61 passed (61)
```

| ファイル | 対象 | 件数 |
|---|---|---|
| `tests/task.test.ts` | ステータス機械（前進・後退・両端クランプ・可逆性）、優先度/期限ソート、レーン集計 | 10 |
| `tests/parse.test.ts` | タグ・優先度・相対日付・曜日・月日・時刻・複合・ISO 形式・AI 整形後の往復 | 19 |
| `tests/flick.test.ts` | 距離しきい値・速度しきい値・タップ誤爆防止・距離優先 | 5 |
| `tests/ai.test.ts` | モデル出力からの JSON 抽出、壊れた出力への耐性、ローカル解析とのマージ規則 | 14 |
| `tests/session.test.ts` | HMAC 署名の往復、別鍵・改竄・不正形式の拒否、期限切れ、Unicode | 9 |
| `tests/format.test.ts` | 期限ラベル（今日/明日/N日後/N日前/月日）、期限超過判定 | 4 |

## 2. API — 実リクエスト

| # | 内容 | 期待 | 結果 |
|---|---|---|---|
| A1 | `GET /api/health`（未認証） | 200 + 設定状況 | ✅ `{"ok":true,"devAuth":true,"googleConfigured":false}` |
| A2 | `GET /api/tasks`（未認証） | 401 | ✅ |
| A3 | `POST /api/auth/dev` | セッション Cookie 発行 | ✅ |
| A4 | `GET /api/me` | ユーザー情報 | ✅ |
| A5 | `POST /api/tasks` に `raw` のみ | サーバ側パースでタスク生成 | ✅ `"tomorrow 17:00 send invoice #work !!"` → title/tags/priority/dueAt すべて分解 |
| A6 | `PATCH` でステータス変更 | 200 + 更新後の値 | ✅ |
| A7 | `PATCH` に不正なステータス | 400 | ✅ `{"error":"bad_status"}`（当初は inbox に巻き戻していた。修正済み） |
| A8 | `PATCH` に範囲外の優先度 | 0–2 にクランプ | ✅ |
| A9 | `PATCH` 存在しない id | 404 | ✅ |
| A10 | `POST /api/tasks` タイトル無し | 400 | ✅ |
| A11 | `DELETE` → 再 `DELETE` | 200 → 404 | ✅ ソフトデリート |
| A12 | `POST /api/ai/structure` | 整形結果 | ✅ ローカルフォールバック経路で正しく分解 |
| A13 | `POST /api/ai/structure` 空文字 | 400 | ✅ |
| A14 | `POST /api/ai/plan` | 順序付きプラン | ✅ |
| A15 | `POST /api/tasks/sync` に正常 1 件 + 壊れた 1 件 | 正常分のみ採用 | ✅ `accepted=1` |

## 3. ブラウザ操作

| # | 内容 | 期待 | 結果 |
|---|---|---|---|
| B1 | アプリを開く | 全画面スケルトン | ✅ トップバー・レール・カード 5 枚が実レイアウトの箱で表示 |
| B2 | **クリックせずにいきなりタイプ** | 入力が入る | ✅ スケルトン表示中のままコンポーザーに入力。1 打鍵でスケルトン消失 |
| B3 | `明日 17:00 請求書を送る #work !!` | 解析チップが即時表示 | ✅ `#work` `緊急` `明日` `17:00` |
| B4 | Enter | タスク化 + カウント更新 | ✅ タイトルは `請求書を送る`、メタに `!!` `明日 17:00` `#work` |
| B5 | カードを右にドラッグ | Inbox → Today | ✅ ドラッグ中に傾き・背景に `TODAY ›`・離すと確定 |
| B6 | カードを左にドラッグ | Today → Inbox | ✅ |
| B7 | `›` で Inbox→Today→Doing→Done→Archive | 1 段ずつ前進 | ✅ 各段でレーン数・カード色・グリフが追従 |
| B8 | Archive で `›` | 無効（クランプ） | ✅ `disabled`。ラベルも「これ以上進められません」に修正済み |
| B9 | レーンタブ切替 | ピルがスライド | ✅ `layoutId` による連続アニメーション |
| B10 | リロード（未サインイン） | タスクが残る | ✅ localStorage から復元、未同期チップ `1` 表示 |
| B11 | ローカルサインイン | 未同期分が D1 へ | ✅ 日本語タイトル・タグ・優先度・期限・ステータスすべて保持。キュー空に |
| B12 | AI ボタン `✦` | メモを整形 | ✅ `金曜 15時 歯医者 #health !` → `歯医者 10/23 15:00 #health !`（当初は期限が消えていた。修正済み） |
| B13 | 今日の順番を出す | 優先度順のプラン | ✅ `1. 会計に連絡 / 2. 歯医者 / 3. ジムに行く`（archived は除外） |
| B14 | シートを下にドラッグ | 閉じる | ✅ |
| B15 | `×` で削除 | ローカルとサーバ両方から消える | ✅ |
| B16 | **IME 変換中の Enter** | 確定しない | ✅ 変換中は無視、`compositionend` 後の Enter で確定 |
| B17 | オフライン時のキャプチャ | 即時表示 + キュー | ✅ `offline` チップとキューチップが表示、タスクは即座にリストへ |
| B18 | オフライン分を抱えてリロード | 自動再送 | ✅ `/api/tasks/sync` で D1 に到達、キュー空に |
| B19 | サインアウト | セッション破棄 + ローカル消去 | ✅ `/api/me` が 401、チップが `local` に戻る |
| B20 | デスクトップ幅 | 中央 560px で破綻なし | ✅ |
| B21 | 未設定時の Google ボタン | 設定不足を明示 | ✅ `GOOGLE_CLIENT_ID 未設定` と表示し、ボタンを出さない |

## このテストで見つけて直したもの

1. **`Hello! world` が優先度「重要」として解釈されていた** — 末尾か独立トークンの `!` のみを優先度として扱うよう修正（`shared/parse.ts`、回帰テスト追加）。
2. **`PATCH` に不正なステータスを送るとタスクが黙って Inbox に移動していた** — 400 で拒否するよう変更（`worker/index.ts`）。
3. **AI 整形がメモの期限を破棄していた** — 整形結果をテキストに書き戻す際に日付トークンを含めるよう修正（`src/components/Composer.tsx`、往復テスト追加）。
4. **終端の無効ボタンが「Archive へ」と読み上げていた** — 無効時のラベルを実態に合わせて修正（`src/components/TaskCard.tsx`）。
5. **`/api/health` が認証を要求していた** — 未認証でも設定状況を返せるよう公開パスに追加。
6. **オーロラ背景が明るすぎて「黒ベース」でなくなっていた** — 不透明度を下げ、中心以外を黒に落とすビネットを追加。
7. **レーンのタブが 375px 幅で見切れていた** — 余白を詰めて 5 レーンが収まるようにし、それでも溢れる場合に備えてスクロール＋端のフェード＋選択時の自動スクロールを実装（`src/components/LaneRail.tsx`）。
8. **入力欄にフォーカスリングの四角が出てガラスを割っていた** — コンポーザーのみリングを外し、面全体の発光でフォーカスを示すよう変更。

## 4. 本番デプロイ後の検証

`https://glasstask.moufu.workers.dev` / Chromium (375×812)

| # | 内容 | 期待 | 結果 |
|---|---|---|---|
| P1 | `GET /api/health` | JSON を返す | ✅（当初は SPA の HTML を返していた。修正済み） |
| P2 | `POST /api/auth/dev` | **404** | ✅ `{"error":"disabled"}` — ホスト名ゲートが本番で閉じていることを実地で確認 |
| P3 | `GET /api/health` の `devAuth` | `false` | ✅ |
| P4 | `GET /api/tasks`（未認証） | 401 | ✅ |
| P5 | `GET /api/auth/google`（未設定） | 503 | ✅ |
| P6 | `/` | SPA が描画 | ✅ コンポーザーに自動フォーカス、5 レーン表示 |
| P7 | `/some/deep/route` | SPA フォールバック | ✅ 200 + index.html |
| P8 | 未サインインでのキャプチャ | 即時表示 + キュー | ✅ `本番確認 明日 9:00 #deploy !` → 期限 `2026-10-23T09:00+09:00`、タグ、優先度すべて解決。未同期チップ `1` |

### 本番で見つけて直したもの

9. **`/api/*` が Worker に届かず SPA の HTML を返していた** — Workers Static Assets は
   アセットを先に処理し、SPA フォールバックで未知のパスに index.html を返すため、
   API 呼び出しがすべて HTML になっていた。`assets.run_worker_first: ["/api/*"]` を
   追加して解決。**ローカルの Vite プラグインは `/api/*` を先に Worker へ回すため、
   この差は本番でしか出ない。**

## 5. 本番 + 実モデルでの検証

Google サインイン設定後。`https://glasstask.moufu.workers.dev` と、
`CF_REMOTE_BINDINGS=1 npm run dev`（実 Workers AI に接続したローカル）。

| # | 内容 | 期待 | 結果 |
|---|---|---|---|
| R1 | Google サインイン | セッション発行 | ✅ `google:1096181…`、email / name / picture が id_token から取得できている |
| R2 | 未サインイン時に書いたタスクの同期 | 本番 D1 に到達 | ✅ `/api/tasks/sync` で再送、キュー空に |
| R3 | 本番 D1 の内容 | タイトル・タグ・優先度・期限が保持 | ✅ |
| R4 | `/api/ai/structure`（実モデル） | `source: "ai"` | ✅ `来週の引っ越しの準備いろいろ` → title `引っ越し準備` / note / tags `[引っ越し, 家]` / priority 1 / subtasks 4 件（約 1.8 秒） |
| R5 | `/api/ai/plan`（実モデル） | 番号付きの順序リスト | ✅ `1. ジムに行く / 2. 歯医者 / 3. 月次レポート / 4. 請求書を送る`（約 1.7 秒） |
| R6 | Workers AI のモデル ID | アカウントで利用可能 | ✅ `wrangler ai models` に `@cf/meta/llama-3.3-70b-instruct-fp8-fast` が存在 |

### 実モデルで初めて見つかって直したもの

10. **`/api/ai/plan` がタスクを増殖させていた** — 素の `prompt` を渡していたため、
    instruct モデルが入力の書式を continuation し、リストをそのまま返した上に
    存在しない行を生成していた。chat ロール（system + user）に変更し、さらに
    「リストに存在するタイトルを、重複なく、5 行まで」という契約を
    `takeOrderedLines()` でコード側から強制。守れなければ決定的順序にフォールバックする。

11. **`/api/ai/structure` が毎回ローカル解析に落ちていた** — 10 の修正で chat 形式に
    変えた副作用。Workers AI は `prompt` には `{ response: "..." }` を返すが、
    `messages` には **OpenAI 互換の chat completion 形状**（`choices[0].message.content`）
    を返す。`response` だけを読んでいたため非文字列が渡り、`extractJson` が
    `raw.indexOf is not a function` で例外を投げ、**モデル障害を吸収するための
    catch がそれを握りつぶしていた**。ハードなバグがモデル不調と同じ見た目になっていた。
    `responseText()` で両方の形状に対応し、`extractJson` は非文字列に対して
    例外ではなく `null` を返すようにして、同じ隠蔽が二度と起きないようにした。

## 検証していないもの

- **上記 10・11 の修正後の本番での AI 応答** — 修正は実モデルに接続したローカル（`CF_REMOTE_BINDINGS=1`）で検証済み。本番は同一コードだが、ブラウザのセッションが切れたため修正後の再確認は未実施。
- **実機の iOS Safari / Android Chrome** — Chromium のモバイルエミュレーションのみ。
- **サーバ側の相対日付解決のタイムゾーン** — `POST /api/tasks` に `raw` を渡した場合のみ Worker のタイムゾーン（本番は UTC）で解決される。ブラウザ経由の通常経路は解決済みの `dueAt` を送るため影響しない。

