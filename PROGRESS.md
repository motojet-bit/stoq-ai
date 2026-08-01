# PROGRESS — StockAnalyzer

> このファイルは**作業開始時に必ず読み込む**こと。
> 作業終了・区切り時には「現在のステータス」と「作業履歴」を更新すること。

---

## 現在のステータス

**フェーズ: 2 — データパイプライン ＆ AI分析エンジン**
**Step 1 / Step 1.1 / Step 2 ✅ 完了**

Phase 2 の全体設計を `docs/設計.md` に記載。
Step 1 として設定モーダル・APIキーの安全な保存・LLM 接続基盤・対話パネルからの
ストリーミング疎通確認までを実装し、Step 1.1 で OpenAI互換プロバイダを
固定 1 枠から**自由に追加・削除できるリスト**へ拡張した。

### Phase 2 のステップ

| Step | 内容 | 状態 |
| --- | --- | --- |
| **Step 1** | APIキー設定画面（モーダル UI）と LLM 接続基盤 | ✅ 完了 |
| **Step 1.1** | OpenAI互換プロバイダの可変長リスト化（追加・削除） | ✅ 完了 |
| **Step 2** | Financial Data Fetcher（Yahoo Finance / SEC EDGAR）と UI 接続 | ✅ 完了 |
| Step 3 | PDF パーサ ＋ トークンカウンター ＋ オーバーフロー警告 | ⬜ |
| Step 4 | Prompt Engine（20項目）とパイプライン | ⬜ |
| Step 5 | 分析結果テーブルのパースとレンダリング | ⬜ |

### Step 1 の実装内容

| 項目 | 状態 |
| --- | --- |
| 設定の永続化（OS のアプリ設定ディレクトリ） | ✅ `src-tauri/src/settings.rs` |
| APIキーのマスク表示（生の値をフロントに渡さない） | ✅ |
| 設定モーダル UI | ✅ `src/components/SettingsModal.tsx` |
| プロバイダ選択（組み込み 3 種 + カスタム任意個） | ✅ |
| **OpenAI互換プロバイダの追加・削除（可変長リスト）** | ✅ ラベル / Base URL / キー / モデル名 |
| モデル名のコンボボックス入力（候補選択 + 手入力） | ✅ `src/components/ModelCombo.tsx` |
| SEC User-Agent の設定 | ✅ |
| LLM 共通インターフェース | ✅ `src-tauri/src/llm/` |
| SSE ストリーミング → Tauri Channel | ✅ |
| 対話パネルからの疎通確認 | ✅ **実機で往復成功（OpenAI / gpt-5.6）** |
| メニュー「ファイル > 設定…」/「ヘルプ > APIキーの設定…」から起動 | ✅ |
| APIキーインジケーターのクリックで起動 | ✅ |
| `Ctrl+,` ショートカット | ✅ |

### 重要な設計上の判断（詳細は `docs/設計.md`）

1. **HTTP はすべて Rust 側から発行する。** CORS 回避、SEC が要求する User-Agent の指定、
   APIキーの秘匿、Yahoo の Cookie 保持が理由。`src/lib/` は Tauri コマンドの薄いラッパ。
2. **PDF は `pdf-parse` ではなく `pdfjs-dist` を使う。** `pdf-parse` は Node 専用で
   WebView では動作しないため（Step 3 で実装）。
3. **Anthropic には `temperature` を送らない。** Claude Opus 5 では `temperature` が
   廃止されており、送ると HTTP 400 になる。深さの制御は `output_config.effort` で行う。
   OpenAI / Gemini / Custom には設計どおり `temperature: 0.0` を送信。
4. **`.env` の `VITE_*` によるキー読み取りは廃止。** Phase 1 の暫定実装を削除し、
   Rust 側の設定ファイルへ移行した。

---

### Step 2 の実装内容

| 項目 | 状態 |
| --- | --- |
| Yahoo Finance クライアント（Cookie + crumb 認証） | ✅ `src-tauri/src/yahoo.rs` |
| 主要指標 6 グループ 36 項目の取得・整形 | ✅ |
| `quoteSummary` 失敗時も株価だけは返すフォールバック | ✅ |
| SEC 提出状況の軽量照会（本文を落とさない） | ✅ `edgar::fetch_status` |
| ティッカー入力 →「分析」でのデータ取得 | ✅ YF と SEC を並行実行 |
| 指標カードへの描画 | ✅ `MetricCard.tsx` |
| 資料準備インジケーター（🟢/🟡/🔴） | ✅ `FilingStatusBadge.tsx` |
| ローディング表示（スケルトン / スピナー） | ✅ `MetricCardSkeleton.tsx` |
| エラー時のトースト通知と再試行ボタン | ✅ `ToastHost.tsx` |

---

## 次にやること（TODO）

### Step 3 以降
- [ ] `pdfjs-dist` を導入し `src/lib/parser/` を実装
- [ ] トークン数の概算カウンターとオーバーフロー警告インジケーター
- [ ] 20項目の評価基準を `src/lib/prompts/criteria.ts` に確定させる（**ユーザーの確認待ち**）
- [ ] 統合プロンプトのパッキングと Markdown テーブルのパース
- [ ] 会話履歴の永続化（現在 `sampleData.ts` のダミー）

---

## 作業履歴

### 2026-08-01 — Phase 2 Step 2: Yahoo Finance ＆ SEC EDGAR のデータ取得と UI 接続 ✅
- **Yahoo Finance クライアント**（`src-tauri/src/yahoo.rs`）を実装
  - Cookie → crumb → quoteSummary の 3 段認証。crumb はプロセス内にキャッシュし、
    401 のときだけ 1 回取り直す
  - 6 グループ 36 項目（時価総額 / PER / PBR / PSR / 売上・EPS成長率 / 営業利益率 /
    ROE / フリーCF / D/E ほか）を取得し、表示用に整形
  - Yahoo は割合を小数で返すものと百分率で返すものが混在するため整形関数を分けた
    （`returnOnEquity` は 0.4523、`debtToEquity` は 78.445）
  - `quoteSummary` が失敗しても、crumb 不要の `chart` から株価・銘柄名・通貨は返す
- **SEC 提出状況の軽量照会**（`edgar::fetch_status`）を追加。本文をダウンロードせず、
  10-K / 10-Q の最新 1 件（提出日・対象期間・URL）だけを返す
  - 「EDGAR に無い」「User-Agent 未設定」はエラーではなく `status` として返し、
    非米国上場銘柄でも Yahoo の指標表示を止めない
- フロントエンド
  - `src/lib/api/` に `yahoo.ts` / `sec.ts` / `analysisStore.ts` を追加。
    YF と SEC は並行実行し、片方の失敗が他方を止めない
  - `WorkspacePanel` を実データ描画に置き換え（銘柄名・株価・前日比・取得時刻）
  - `MetricCard` / `MetricCardSkeleton` / `FilingStatusBadge` を追加
  - `ToastHost` + `toastStore` でエラー通知（種類ごとに自動消去時間を変える）
  - 取得失敗時は本文中にもエラーと「再試行」ボタンを表示
- **実 API で検証済み**
  - Yahoo: crumb 取得成功、使用している 32 フィールドすべてが AAPL で実値を返す
  - SEC: ticker マップ 10,432 銘柄、AAPL の 10-K (2025-10-31) / 10-Q (2026-07-31) の
    URL 生成まで確認。7203.T が EDGAR 未登録（🔴 相当）であることも確認

### 2026-08-01 — 改良: モデル名入力欄をコンボボックス化 ✅
- **LLM 疎通確認がユーザー側で成功**（OpenAI / gpt-5.6）。方言の自動フォールバックも機能
- モデル名の入力欄を `<datalist>` によるコンボボックスに変更（`ModelCombo.tsx`）
  - ドロップダウンから代表的なモデルを選択でき、任意の文字列の手入力も可能
  - 新しいモデルが出てもアプリを更新せずに使える
- `modelCatalog.ts` に候補を集約。OpenAI互換プロバイダは **Base URL から提供元を推測**して
  候補を切り替える（deepseek / moonshot / openrouter / groq / localhost）
- ユーザー例示の `claude-3-5-sonnet-latest` / `claude-3-opus-latest` は提供終了済みのため、
  現行の `claude-opus-5` / `claude-sonnet-5` / `claude-opus-4-8` / `claude-haiku-4-5` を候補にした

### 2026-08-01 — 修正: GPT-5 系で送信が 400 になる問題 ✅
- OpenAI のキー投入後、`Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens' instead`
  で送信が失敗する不具合を修正
- 原因: OpenAI互換 API 間でパラメータの方言が揃っていない
  - GPT-5 系は `max_completion_tokens` のみ受け付け、`temperature` も既定値以外を拒否
  - DeepSeek 等の他社互換は `max_tokens` のみ
- 対応: `llm/openai.rs` に方言吸収を実装。400 のエラーメッセージを読んで
  パラメータを調整し自動で再送する（最大 3 回、出力上限の切り替えは 1 回のみ）
- 対話パネルに、選択中プロバイダの設定不足を常時知らせる警告バーを追加

### 2026-08-01 — Phase 2 Step 1.1: OpenAI互換プロバイダの可変長リスト化 ✅
- 固定 1 枠だった OpenAI互換プロバイダを、**任意個追加・削除できるリスト**に変更
  - `CustomProvider { id, label, base_url, model }` を導入し、`Settings.custom_providers: Vec<_>` で保持
  - APIキーは組み込み・カスタムを区別せず同一辞書（プロバイダ ID → キー）で管理。
    マスク表示・保存・削除のロジックが 1 本で済む
  - 枠を削除すると対応する APIキーも同時に破棄。選択中のものを消した場合は組み込みへ戻す
  - 旧形式（`custom_base_url` + `keys["custom"]`）を読み込み時に自動でリストへ移行
- Rust コマンドを追加: `settings_add_custom_provider` / `settings_update_custom_provider` /
  `settings_remove_custom_provider`
- `llm/mod.rs` のディスパッチを ID ベースに変更。組み込み 3 種以外は
  カスタム定義を引いて OpenAI 互換実装を再利用する
- フロントエンド
  - `providers.ts` を組み込み定義 + ラベル解決 + `providerReadiness()`（キー / Base URL /
    モデル名が揃っているかの判定）に再編
  - `SettingsModal` に「＋ プロバイダーを追加」と各枠の「✕」を実装。ラベルはインライン編集
  - `ApiKeyIndicator` を全プロバイダ表示に対応（横スクロール、ラベル truncate）
- **将来の複数 LLM 直列/並列検証**に備え、カスタムプロバイダを配列として保持している
- **次**: Step 2（Yahoo Finance クライアントと財務データの UI 接続）

### 2026-08-01 — Phase 2 Step 1: 設定モーダルと LLM 接続基盤 ✅
- `docs/設計.md` に Phase 2 の全体設計図を記載（モジュール構成・データフロー・
  アーキテクチャ判断・Step 1 詳細設計・20項目の初期案）
- Rust 側を実装
  - `error.rs` — 共通エラー型（日本語メッセージでフロントへ返す）
  - `http.rs` — Cookie ストア共有の HTTP クライアント
  - `settings.rs` — 設定の永続化、APIキーのマスク処理
  - `llm/mod.rs` — 共通インターフェース、SSE ポンプ、Channel 送出
  - `llm/openai.rs` / `llm/anthropic.rs` / `llm/gemini.rs` — 3 実装（Custom は openai を再利用）
  - `commands.rs` — `settings_load` / `settings_save` / `settings_set_key` / `llm_send`
- フロントエンドを実装
  - `src/lib/tauri.ts` — invoke / Channel のラッパと Tauri 環境判定
  - `src/lib/config/providers.ts` — プロバイダのメタ情報
  - `src/lib/config/settingsStore.ts` — `useSyncExternalStore` による設定ストア
  - `src/lib/llm/client.ts` — `streamChat`（Channel を Promise + コールバックに変換）
  - `src/components/SettingsModal.tsx` — 設定モーダル
  - `ChatPanel` を実接続（ストリーミング表示、Enter 送信、エラー表示）
  - `ApiKeyIndicator` / `CommandBar` / `MenuBar` / `App` を設定ストアに接続
- `.env` ベースのキー読み取り（`apiKeyStatus.ts` / `maskSecret.ts`）を削除
- `CLAUDE.md` に「秘密情報をフロントに渡さない」「HTTP は Rust 側」のルールを追記
- **Step 2 の先行実装**: `edgar.rs`（SEC EDGAR）と `html.rs`（HTML→テキスト）を作成。
  コマンド `sec_fetch_latest_filing` として登録済みだが **UI には未接続**
- **次**: Step 2（Yahoo Finance クライアントと財務データの UI 接続）

### 2026-08-01 — Phase 1: スケルトンUI の構築と起動確認 ✅
- 開発環境を調査。Rust 1.95 / VS Build Tools 2022 / WebView2 は導入済み、Node.js のみ未導入と判明
- **Node.js 24.18.1 を winget でインストール**（ユーザー承認のうえ実行）
- Tauri 2.0 プロジェクトを構成（`Cargo.toml` / `tauri.conf.json` / `main.rs` / `lib.rs` / `commands.rs`）
- アプリアイコンを生成（Python の自作スクリプトで PNG / ICO を出力）
- フロントエンドを構成（Vite 7 / React 19 / TypeScript strict / Tailwind CSS v4 / `@/` エイリアス）
- スケルトン UI を 1 機能 1 ファイルで実装（`src/components/` 配下 13 ファイル）
- **動作確認**: typecheck ✅ / build ✅ / Vite dev ✅ / Tauri ウィンドウ起動 ✅

### 2026-07-31 — プロジェクト初期セットアップ
- Git リポジトリを初期化（ブランチ `main`）
- `.gitignore` / `.gitattributes` / `README.md` / `PROGRESS.md` / `改修記録.md` / `CLAUDE.md` を作成
- `docs/` ディレクトリと設計・API 調査のプレースホルダを作成
