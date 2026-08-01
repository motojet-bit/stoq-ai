# StockAnalyzer — 米国株＆グローバル株 AI分析デスクトップアプリ

各種 API（SEC / Yahoo Finance 等）と PDF 決算資料を読み込み、LLM（OpenAI / Claude / Gemini）を
活用してファンダメンタル分析を行う、**超軽量デスクトップアプリ**。

## 技術スタック

| 層 | 採用技術 |
| --- | --- |
| デスクトップシェル | Tauri 2.0（Rust） |
| フロントエンド | React 19 + TypeScript |
| ビルド | Vite |
| スタイル | Tailwind CSS v4 |

## レイアウト方針

```
┌──────────────────────────────────────────────────────────┐
│ メニューバー  ファイル / 表示 / 分析 / ヘルプ              │
├──────────────────────────────────────────────────────────┤
│ ティッカー入力 │ PDFドロップゾーン │ APIキー状態          │
├──────────┬───────────────────────────────────────────────┤
│ 履歴      │ タブ1 │ タブ2 │ +          （Cursor風）      │
│ (Chatbox │───────────────────────────────────────────────┤
│  風・折り │  ワークスペース（指標・要約・論点）           │
│  たたみ可)│═══════════ ドラッグで高さ変更 ═══════════════│
│           │  分析結果        │  対話                      │
├──────────┴───────────────────────────────────────────────┤
│ ステータスバー                                            │
└──────────────────────────────────────────────────────────┘
```

## セットアップ

### 前提

| 必要なもの | 状態 |
| --- | --- |
| Rust（stable, MSVC） | ✅ 1.95.0 |
| Visual Studio Build Tools 2022（C++） | ✅ 17.14 |
| WebView2 Runtime | ✅ 150.0 |
| Node.js 20+ | ⬜ **要インストール** |

Node.js のインストール:

```powershell
winget install OpenJS.NodeJS.LTS
```

### 手順

```powershell
# 1. 依存パッケージのインストール
npm install

# 2. APIキーの設定（任意。未設定でも画面は起動する）
Copy-Item .env.example .env
#   → .env を編集して VITE_OPENAI_API_KEY などを入れる

# 3-a. ブラウザだけで確認する場合
npm run dev          # http://localhost:1420

# 3-b. Tauri ウィンドウで起動する場合
npm run tauri:dev    # 初回は Rust のビルドで数分かかる
```

### その他のコマンド

```powershell
npm run typecheck    # 型チェックのみ
npm run build        # フロントエンドのビルド
npm run tauri:build  # 配布用インストーラのビルド
```

## ディレクトリ構成

```
StockAnalyzer/
├── src/                    フロントエンド（React + TS）
│   ├── App.tsx             全体レイアウトと状態管理
│   ├── components/         1 コンポーネント 1 ファイル
│   ├── lib/                純粋なロジック・ユーティリティ
│   ├── types/              型定義
│   └── styles.css          Tailwind の読み込みと全体スタイル
├── src-tauri/              Tauri（Rust）側
│   ├── src/lib.rs          エントリポイント
│   ├── src/commands.rs     フロントから invoke されるコマンド
│   ├── tauri.conf.json     ウィンドウ・バンドル設定
│   └── icons/              アプリアイコン
└── docs/                   設計図・API 調査メモ
```

## ドキュメント

| ファイル | 役割 |
| --- | --- |
| [PROGRESS.md](PROGRESS.md) | 現在のステータスと TODO、作業履歴 |
| [改修記録.md](改修記録.md) | 指示ごとの改修内容の記録 |
| [CLAUDE.md](CLAUDE.md) | 開発・コード記述ルール |
| [docs/設計.md](docs/設計.md) | 設計図 |
| [docs/api調査.md](docs/api調査.md) | 外部 API の調査メモ |

## 開発フェーズ

- **Phase 1（進行中）**: スケルトン UI — 画面の骨格を立ち上げる
- Phase 2: データ取得層（SEC EDGAR / Yahoo Finance）
- Phase 3: PDF 取り込みとテキスト抽出
- Phase 4: LLM 分析エンジン
- Phase 5: 永続化・スクリーニング
- Phase 6: モバイル対応

## ライセンス / 公開範囲

個人開発。現時点では非公開想定。
