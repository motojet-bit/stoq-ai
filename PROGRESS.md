# PROGRESS — StockAnalyzer

> このファイルは**作業開始時に必ず読み込む**こと。
> 作業終了・区切り時には「現在のステータス」と「作業履歴」を更新すること。

---

## 現在のステータス

**フェーズ: 2 — データパイプライン ＆ AI分析エンジン**
**Step 1（APIキー設定画面 + LLM 接続基盤）✅ 完了**

Phase 2 の全体設計を `docs/設計.md` に記載。
Step 1 として、設定モーダル・APIキーの安全な保存・4 プロバイダ対応の LLM 接続基盤・
対話パネルからのストリーミング疎通確認までを実装した。

### Phase 2 のステップ

| Step | 内容 | 状態 |
| --- | --- | --- |
| **Step 1** | APIキー設定画面（モーダル UI）と LLM 接続基盤 | ✅ 完了 |
| Step 2 | Financial Data Fetcher（Yahoo Finance / SEC EDGAR）と UI 接続 | 🔶 SEC のみ先行実装（UI 未接続） |
| Step 3 | PDF パーサ ＋ トークンカウンター ＋ オーバーフロー警告 | ⬜ |
| Step 4 | Prompt Engine（20項目）とパイプライン | ⬜ |
| Step 5 | 分析結果テーブルのパースとレンダリング | ⬜ |

### Step 1 の実装内容

| 項目 | 状態 |
| --- | --- |
| 設定の永続化（OS のアプリ設定ディレクトリ） | ✅ `src-tauri/src/settings.rs` |
| APIキーのマスク表示（生の値をフロントに渡さない） | ✅ |
| 設定モーダル UI | ✅ `src/components/SettingsModal.tsx` |
| プロバイダ選択（OpenAI / Anthropic / Gemini / Custom） | ✅ |
| モデル名・Base URL・SEC User-Agent の設定 | ✅ |
| LLM 共通インターフェース（4 プロバイダ） | ✅ `src-tauri/src/llm/` |
| SSE ストリーミング → Tauri Channel | ✅ |
| 対話パネルからの疎通確認 | ✅ `src/components/ChatPanel.tsx` |
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

## 次にやること（TODO）

### Step 2（次の作業）
- [ ] Yahoo Finance クライアントを実装する（`src-tauri/src/yahoo.rs`）
      — quoteSummary は Cookie + crumb の取得が必要
- [ ] SEC クライアント（実装済み）を UI に接続する
- [ ] 取得した指標を `WorkspacePanel` に表示する
- [ ] `src/lib/api/` に Tauri コマンドのラッパを作る

### Step 3 以降
- [ ] `pdfjs-dist` を導入し `src/lib/parser/` を実装
- [ ] トークン数の概算カウンターとオーバーフロー警告インジケーター
- [ ] 20項目の評価基準を `src/lib/prompts/criteria.ts` に確定させる（**ユーザーの確認待ち**）
- [ ] 統合プロンプトのパッキングと Markdown テーブルのパース
- [ ] 会話履歴の永続化（現在 `sampleData.ts` のダミー）

---

## 作業履歴

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
