# PROGRESS — StockAnalyzer

> このファイルは**作業開始時に必ず読み込む**こと。
> 作業終了・区切り時には「現在のステータス」と「作業履歴」を更新すること。

---

## 現在のステータス

**フェーズ: 1 — スケルトンUI ✅ 完了（Tauri ウィンドウでの起動確認済み）**

Tauri 2.0 + React 19 + TypeScript + Tailwind CSS v4 の構成でプロジェクトを構築し、
画面の骨格（ガワ）を実装。`npm run tauri:dev` でデスクトップウィンドウが正常に起動することを確認した。

### 開発環境（すべて導入済み）

| 必要なもの | バージョン |
| --- | --- |
| Node.js | ✅ 24.18.1 |
| npm | ✅ 11.16.0 |
| Rust (stable, MSVC) | ✅ 1.95.0 |
| Visual Studio Build Tools 2022 (C++) | ✅ 17.14.37314.3 |
| WebView2 Runtime | ✅ 150.0.4078.105 |

### 検証結果

| 検証 | 結果 |
| --- | --- |
| `npm install` | ✅ 87 パッケージ |
| `npm run typecheck` | ✅ エラーなし（TypeScript strict） |
| `npm run build` | ✅ Vite 7.3.6 / 213.82 KB（gzip 67.36 KB） |
| `npm run dev`（ブラウザ） | ✅ http://localhost:1420 で起動 |
| `npm run tauri:dev`（Tauri ウィンドウ） | ✅ Rust ビルド 2分05秒 → ウィンドウ起動確認 |

### 実装状況

| 項目 | 状態 |
| --- | --- |
| Git リポジトリ | ✅ 初期化済み（`main`） |
| ドキュメント整備 | ✅ README / PROGRESS / 改修記録 / CLAUDE.md / docs |
| Tauri 2.0 プロジェクト構成 | ✅ Cargo.toml / tauri.conf.json / lib.rs / commands.rs |
| アプリアイコン | ✅ 生成済み（`src-tauri/icons/`） |
| Vite + React + TS 構成 | ✅ package.json / vite.config.ts / tsconfig.json |
| Tailwind CSS v4 | ✅ `@tailwindcss/vite` プラグイン方式 |
| メニューバー（ファイル/表示/分析/ヘルプ） | ✅ ドロップダウン付き（項目の動作は未実装） |
| ティッカー入力フォーム | ✅ 入力で分析タブが開く |
| APIキー状態インジケーター | ✅ マスキング表示 |
| PDFドロップゾーン | ✅ D&D / クリック選択、ファイル名の保持まで |
| 左サイドバー（Chatbox風・折りたたみ） | ✅ 新規チャットボタン / Ctrl+B |
| マルチタブ（Cursor風） | ✅ 追加・切替・クローズ |
| 下部スプリット画面 | ✅ ドラッグでリサイズ、分析結果 / 対話 の枠 |
| ステータスバー | ✅ |

---

## 次にやること（TODO）

### Phase 2 の入口
- [ ] 正式な設計図・機能仕様を受け取り `docs/設計.md` に反映する
- [ ] 実装の優先順位を決める（SEC / Yahoo Finance / PDF / LLM のどれから着手するか）

### Phase 2 — データ取得層
- [ ] SEC EDGAR クライアント（Rust 側）— User-Agent 必須、10 req/s 制限に注意
- [ ] Yahoo Finance からの株価・指標取得
- [ ] 取得結果のキャッシュ方針を決める

### Phase 3 — 一次資料の取り込み
- [ ] PDF のテキスト抽出（Rust 側 or フロント側かを決定）
- [ ] `PdfDropZone` を実ファイル読み込みに接続する

### Phase 4 — LLM 分析エンジン
- [ ] LLM プロバイダ抽象化（OpenAI / Claude / Gemini 切替）
- [ ] APIキーを OS セキュアストレージへ移し、フロントから実キーを見えなくする
      （現在は `.env` の `VITE_*` を読む暫定実装）
- [ ] `AnalysisPanel` / `ChatPanel` を実データに接続する

### Phase 5 — 永続化・スクリーニング
- [ ] 会話履歴・タブ状態の永続化（`sampleData.ts` のダミーを置き換える）
- [ ] スクリーニング条件の設定 UI

### Phase 6
- [ ] モバイル対応

### 積み残し（小）
- [ ] メニューバー各項目に実際の動作を割り当てる
- [ ] `npm` の警告: esbuild の postinstall スクリプトが未承認（現状ビルドは成功）

---

## 作業履歴

### 2026-08-01 — Phase 1: スケルトンUI の構築と起動確認 ✅
- 開発環境を調査。Rust 1.95 / VS Build Tools 2022 / WebView2 は導入済み、Node.js のみ未導入と判明
- **Node.js 24.18.1 を winget でインストール**（ユーザー承認のうえ実行）
- Tauri 2.0 プロジェクトを構成
  - `src-tauri/`: `Cargo.toml` / `build.rs` / `tauri.conf.json` / `src/main.rs` / `src/lib.rs` / `src/commands.rs`
  - 疎通確認用コマンド `app_info` を用意
  - アプリアイコンを生成（Python の自作スクリプトで PNG / ICO を出力）
- フロントエンドを構成
  - `package.json` / `vite.config.ts` / `tsconfig.json` / `index.html`
  - Tailwind CSS v4 を `@tailwindcss/vite` で導入、`@/` パスエイリアスを設定
- スケルトン UI を 1 機能 1 ファイルで実装（`src/components/` 配下 13 ファイル）
  - `MenuBar` / `CommandBar` / `TickerInput` / `ApiKeyIndicator` / `PdfDropZone`
  - `Sidebar` / `TabBar` / `WorkspacePanel` / `SplitPane` / `AnalysisPanel` / `ChatPanel` / `StatusBar`
  - `Icons.tsx`（外部アイコンライブラリに依存しないインライン SVG）
- ロジックを `src/lib/` に分離（`maskSecret` / `apiKeyStatus` / `sampleData`）
- `CLAUDE.md` に「1機能1ファイル」「PROGRESS.md の読み込み・更新」ルールを明記
- `README.md` にセットアップ手順とディレクトリ構成を記載
- **動作確認**: typecheck ✅ / build ✅ / Vite dev ✅ / Tauri ウィンドウ起動 ✅
- ロックファイル（`package-lock.json` / `Cargo.lock`）をコミットに追加
- **次**: 正式な設計図を受け取り、Phase 2（データ取得層）の着手順を決める

### 2026-07-31 — プロジェクト初期セットアップ
- Git リポジトリを初期化（ブランチ `main`）
- `.gitignore` / `.gitattributes` を作成（秘密情報・ローカルデータの除外、改行コードの統一）
- `README.md`（プロジェクト概要）を作成
- `PROGRESS.md`（本ファイル）を作成
- `改修記録.md`（改修記録テンプレート）を作成
- `CLAUDE.md`（AI アシスタント向け作業ルール）を作成
- `docs/` ディレクトリと設計・API 調査のプレースホルダを作成
