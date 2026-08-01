# PROGRESS — StockAnalyzer

> このファイルは**作業開始時に必ず読み込む**こと。
> 作業終了・区切り時には「現在のステータス」と「作業履歴」を更新すること。

---

## 現在のステータス

**フェーズ: 1 — スケルトンUI（コード実装完了 / 起動確認は Node.js 待ち）**

Tauri 2.0 + React 19 + TypeScript + Tailwind CSS v4 の構成でプロジェクトを構築し、
画面の骨格（ガワ）を実装した。**Node.js が未インストール**のため、
`npm install` および起動確認はまだ行えていない。

### 開発環境

| 必要なもの | 状態 |
| --- | --- |
| Rust (stable, MSVC) | ✅ 1.95.0 |
| Visual Studio Build Tools 2022 (C++) | ✅ 17.14.37314.3 |
| WebView2 Runtime | ✅ 150.0.4078.105 |
| Node.js 20+ | ⬜ **未インストール（ブロッカー）** |

### 実装状況

| 項目 | 状態 |
| --- | --- |
| Git リポジトリ | ✅ 初期化済み（`main`） |
| ドキュメント整備 | ✅ README / PROGRESS / 改修記録 / CLAUDE.md / docs |
| Tauri 2.0 プロジェクト構成 | ✅ Cargo.toml / tauri.conf.json / lib.rs / commands.rs |
| アプリアイコン | ✅ 生成済み（`src-tauri/icons/`） |
| Vite + React + TS 構成 | ✅ package.json / vite.config.ts / tsconfig.json |
| Tailwind CSS v4 | ✅ `@tailwindcss/vite` プラグイン方式 |
| メニューバー（ファイル/表示/分析/ヘルプ） | ✅ ドロップダウン付き |
| ティッカー入力フォーム | ✅ 入力で分析タブが開く |
| APIキー状態インジケーター | ✅ マスキング表示 |
| PDFドロップゾーン | ✅ D&D / クリック選択、ファイル名の保持まで |
| 左サイドバー（Chatbox風・折りたたみ） | ✅ 新規チャットボタン / Ctrl+B |
| マルチタブ（Cursor風） | ✅ 追加・切替・クローズ |
| 下部スプリット画面 | ✅ ドラッグでリサイズ、分析結果 / 対話 の枠 |
| ステータスバー | ✅ |
| **`npm install` と起動確認** | ⬜ **Node.js 導入後に実施** |

---

## 次にやること（TODO）

### 直近（Phase 1 の完了条件）
- [ ] **Node.js 20+ をインストールする**（`winget install OpenJS.NodeJS.LTS`）
- [ ] `npm install` を実行し、依存パッケージのバージョン整合を確認する
- [ ] `npm run dev` でブラウザ表示を確認する
- [ ] `npm run tauri:dev` で Tauri ウィンドウの起動を確認する
- [ ] 起動時に出た問題（バージョン不整合等）を修正する

### Phase 2 以降
- [ ] `docs/設計.md` に正式な設計図を反映する
- [ ] SEC EDGAR クライアント（Rust 側）を実装する
- [ ] Yahoo Finance からの株価・指標取得を実装する
- [ ] PDF 取り込みとテキスト抽出を実装する
- [ ] LLM プロバイダ抽象化（OpenAI / Claude / Gemini 切替）を実装する
- [ ] APIキーを OS セキュアストレージへ移し、フロントから実キーを見えなくする
- [ ] 会話履歴・タブ状態の永続化

---

## 作業履歴

### 2026-08-01 — Phase 1: スケルトンUI の構築
- 開発環境を調査（Rust 1.95 / MSVC BuildTools / WebView2 は導入済み、**Node.js のみ未導入**）
- Tauri 2.0 プロジェクトを構成
  - `src-tauri/`: `Cargo.toml` / `build.rs` / `tauri.conf.json` / `src/main.rs` / `src/lib.rs` / `src/commands.rs`
  - 疎通確認用コマンド `app_info` を用意
  - アプリアイコンを生成（Python の自作スクリプトで PNG / ICO を出力）
- フロントエンドを構成
  - `package.json` / `vite.config.ts` / `tsconfig.json` / `index.html`
  - Tailwind CSS v4 を `@tailwindcss/vite` で導入
  - `@/` パスエイリアスを設定
- スケルトン UI を 1 機能 1 ファイルで実装（`src/components/` 配下 11 ファイル）
  - `MenuBar` / `CommandBar` / `TickerInput` / `ApiKeyIndicator` / `PdfDropZone`
  - `Sidebar` / `TabBar` / `WorkspacePanel` / `SplitPane` / `AnalysisPanel` / `ChatPanel` / `StatusBar`
  - `Icons.tsx`（外部アイコンライブラリに依存しないインライン SVG）
- ロジックを `src/lib/` に分離（`maskSecret` / `apiKeyStatus` / `sampleData`）
- `CLAUDE.md` に「1機能1ファイル」「PROGRESS.md の読み込み・更新」ルールを明記
- `README.md` にセットアップ手順とディレクトリ構成を記載
- **次**: Node.js を導入し、`npm install` → `npm run tauri:dev` で起動を確認する

### 2026-07-31 — プロジェクト初期セットアップ
- Git リポジトリを初期化（ブランチ `main`）
- `.gitignore` / `.gitattributes` を作成（秘密情報・ローカルデータの除外、改行コードの統一）
- `README.md`（プロジェクト概要）を作成
- `PROGRESS.md`（本ファイル）を作成
- `改修記録.md`（改修記録テンプレート）を作成
- `CLAUDE.md`（AI アシスタント向け作業ルール）を作成
- `docs/` ディレクトリと設計・API 調査のプレースホルダを作成
