# PROGRESS — StockAnalyzer

> このファイルは**作業開始時に必ず読み込む**こと。
> 作業終了・区切り時には「現在のステータス」と「作業履歴」を更新すること。

---

## 現在のステータス

**フェーズ: 2 — データパイプライン ＆ AI分析エンジン**
**Step 1 / 1.1 / 2 / 3 / 4 / 4.1 / 5 / 5.1 / 5.2 ✅ 完了 — Phase 2 の主要機能がひととおり動作**

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
| **Step 3** | PDF パーサ ＋ ステージング ＋ トークンカウンター | ✅ 完了 |
| **Step 4** | Prompt Engine（20項目）・ストリーミング・中断 | ✅ 完了 |
| **Step 4.1** | スマート圧縮（中間カット廃止）＋ 4Q モメンタム | ✅ 完了 |
| **Step 5** | フレキシブル UI ＋ 分析結果の永続化（SQLite） | ✅ 完了 |
| **Step 5.1** | 3 ペイン構成への再構築 ＋ 破壊的操作の確認 ＋ プロバイダ UI | ✅ 完了 |
| **Step 5.2** | 2 カラム化 ＋ 分析根拠表示 ＋ チャット履歴の実機能化 | ✅ 完了 |
| Step 6 | 銘柄比較・分析結果の書き出しなど | ⬜ |

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

### Step 3 の実装内容

| 項目 | 状態 |
| --- | --- |
| PDF テキスト抽出（`pdfjs-dist`、動的 import） | ✅ `src/lib/parser/pdf.ts` |
| DOCX テキスト抽出（`fflate` で ZIP 展開） | ✅ `src/lib/parser/docx.ts` |
| HTML / TXT / MD / CSV / JSON の取り込み | ✅ `src/lib/parser/extractText.ts` |
| D&D とファイル選択ダイアログの両対応 | ✅ `PdfDropZone.tsx` |
| `temp_documents/` への永続化（再起動後も保持） | ✅ `src-tauri/src/documents.rs` |
| 一時保存中の資料一覧（🟢 バッジ付き） | ✅ `DocumentTray.tsx` |
| プレビュー（抽出テキスト全文をモーダル表示） | ✅ `DocumentPreviewModal.tsx` |
| リネーム（ダブルクリックでその場編集） | ✅ `StagedFileChip.tsx` |
| 個別削除（✕）と一括クリア | ✅ |
| トークン概算とメーター（🟢/🟡/🔴） | ✅ `TokenMeter.tsx` / `tokenCount.ts` |
| 取り込み中のローディング表示 | ✅ 抽出中 / 保存中 の 2 段階 |

### Step 4 の実装内容

| 項目 | 状態 |
| --- | --- |
| 20項目の評価基準（1 ファイルで差し替え可能） | ✅ `src/lib/prompts/criteria.ts` |
| システムプロンプト（出力フォーマット厳守・幻覚対策） | ✅ `systemPrompt.ts` |
| 統合プロンプトのパッキングと予算配分 | ✅ `buildPrompt.ts` |
| SEC 本文の節優先抽出（Risk Factors / MD&A 等） | ✅ |
| トークン上限超過時の自動切り詰め + 最終検算 | ✅ `enforceLimit` |
| Markdown テーブルのパース（途中経過にも対応） | ✅ `parseAnalysis.ts` |
| 分析実行のオーケストレーション | ✅ `analysisRunner.ts` |
| ストリーミング逐次描画（評価カード） | ✅ `AnalysisPanel.tsx` |
| 中断ボタン（途中結果を保持） | ✅ Rust `llm_cancel` |
| PPTX 対応 / ✏️ リネーム / ドロップゾーン注記 | ✅ Step 3 の微修正 |

### Step 5 の実装内容

| 項目 | 状態 |
| --- | --- |
| 3 ペイン構成（左: 市場データ / 右: 分析結果 / 下: 対話） | ✅ Step 5.1 で再構築 |
| ドラッグでのリサイズ（縦横どちらも） | ✅ `ResizableSplit.tsx` |
| 各ペインの最小化（`_` ボタン） | ✅ `PanelHeader.tsx` |
| 文字サイズ 3 段階（A− / A+、localStorage 保存） | ✅ `textScale.ts` |
| 評価テーブルの列幅・行間・スコアドットの拡大 | ✅ |
| 生成完了と同時に SQLite へ自動保存 | ✅ `analyses.rs` |
| 銘柄タブを開いたときの自動復元 | ✅ |
| 「クリア」ボタン（明示操作時のみ削除） | ✅ |

---

## 次にやること（TODO）

### Step 6 以降
- [ ] 会話履歴の永続化（現在 `sampleData.ts` のダミー）
- [ ] 対話パネルから分析結果を踏まえた追加質問ができるようにする
- [ ] 複数銘柄の比較機能
- [ ] 分析結果の書き出し（Markdown / PDF）
- [ ] メニューバー各項目に実際の動作を割り当てる
- [ ] 画像のみの PDF（スキャン資料）への対応方針を決める（OCR を入れるか否か）
- [ ] 20項目の評価基準をユーザーが UI 上で編集できるようにする

---

## 作業履歴

### 2026-08-01 — Phase 2 Step 5.2: 2 カラム化・分析根拠表示・チャット履歴の実機能化 ✅
6 件の要件を一括で実装した。
1. **ロゴを「StoQ AI Analyzer」に変更**（`MenuBar`）
2. **分析根拠バッジ**を分析結果パネルのヘッダー直下に追加。
   実行時に組み立てて `AnalysisRun.basis` に持ち、SQLite にも保存するため、
   **復元した過去の分析でも当時のデータ元が分かる**
   （`analyses` テーブルに `basis` 列を追加。既存 DB は `ALTER TABLE` で移行）
3. **一次資料が 0 件のときの確認ダイアログ**。指定文面と [戻る] / [このまま分析する]。
   1 件以上あれば確認なしで即実行
4. **2 カラム構造に組み替え**。外側を左右分割、左カラムの内側を上下分割にすることで、
   **左右の仕切りが画面最下部まで一直線に伸びる**。
   市場データは縦スクロール（`overflow-y: auto`）
5. **文字サイズを 4 段階（13 / 15 / 17 / 19px）に拡張**し、
   市場データ・分析結果・対話の**全パネルに適用**。旧保存値は読み替える
6. **チャット履歴を SQLite で実機能化**（`chats.db`）
   - 送信のたびに自動保存。ユーザー発言は応答を待たずに先に保存する
   - 未命名セッションは最初のユーザー発言の先頭 40 文字を自動タイトルにする
   - サイドバーから切り替え・リネーム（✏️ / ダブルクリック）・削除
   - 削除は確認ダイアログを挟み、メッセージも CASCADE で一緒に消える
   - ダミーデータ（`sampleData.ts` の `SAMPLE_SESSIONS`）は削除
- **検証**: チャット履歴の SQLite ロジックを直接実行し、
  作成 / 自動命名（40 文字超の省略含む）/ 一覧（更新順・件数）/ リネーム /
  メッセージ復元 / 削除（CASCADE）がすべて期待どおりであることを確認

### 2026-08-01 — Phase 2 Step 5.1: 3 ペイン構成への再構築 ✅
- **レイアウトを 3 ペイン構成へ作り直した**
  - 上段左＝市場データ（四半期モメンタム / 指標カード / SEC ステータス）
  - 上段右＝20項目の分析結果（**縦長**にしてスクロールしやすくした）
  - 下段＝対話ウィンドウ（**左右いっぱいに横長**、高さ 1/3）
  - すべての境界がドラッグでリサイズ可能。`ResizableSplit` を入れ子で使い回している
  - 各ペインヘッダー右端の **`_`** で最小化、**`□`** で復元。
    左右は同時に畳めないようにした
  - 配置切替は不要になったため `BottomDock` を削除
- **一括クリアの 2 段階確認**を追加（`ConfirmDialog`）
  - 一時保存資料は AI に渡すコンテキストそのものなので、即座に消さず確認を挟む
  - 「事前に AI に『引き継ぎ書』を書かせてから」という案内と、削除件数・トークン数を表示
  - 既定フォーカスを「もどる」に置き、Enter 連打で誤って消えないようにした
- **プロバイダ切替を `ProviderMenu` に集約**
  - 横並び 3 個 →「⚙️ AI設定 ｜ ● 稼働中: OpenAI ▾」の 1 ボタン + ドロップダウン
  - カスタムプロバイダも一覧に出る。未設定の項目には理由（APIキー未設定 / Base URL 未設定）を表示
  - `ApiKeyIndicator` は役目を終えたため削除
- 文字サイズ（A− / A+）は右ペインにそのまま維持

### 2026-08-01 — Phase 2 Step 5: フレキシブル UI ＆ 分析結果の永続化 ✅
- **レイアウト**
  - `ResizableSplit` を新設。**縦並び / 横並びの両方**に対応する汎用スプリット。
    旧 `SplitPane`（縦専用）は削除
  - `BottomDock` で分析結果と対話をまとめ、右上のボタンで配置を切替。
    **既定は縦並び**（20項目テーブルは横幅を使うほうが読みやすいため）。
    選択は localStorage に保存
  - `PanelHeader` に折りたたみボタン。畳むとヘッダーだけが残りタブのように機能する。
    両方同時には畳めないようにした
- **可読性**
  - `textScale.ts` に 3 段階（小 12px / 標準 13px / 大 15px）を定義し、
    分析結果パネルの `A− / A+` で切替。行間も 1.75〜1.95 に拡大
  - 評価テーブルの列幅を広げ、スコアドットを 2px 拡大
- **分析結果の永続化（SQLite）**
  - `rusqlite`（`bundled`）を採用。実行環境に SQLite が無くても動く
  - `<app_data_dir>/analyses.db` に 1 銘柄 1 件（最新）で保存
  - 生成完了と同時に自動保存。**中断した場合も途中結果を保存する**
  - 銘柄タブを開くと自動復元。ヘッダーに「〜に保存した結果を復元」と表示
  - 削除は「クリア」ボタンを押したときだけ
- **検証**: SQLite のロジックを Tauri なしで直接実行し、
  保存 / 同一銘柄の上書き / 復元 / 一覧（新しい順）/ 個別削除がすべて期待どおりであることを確認

### 2026-08-01 — Phase 2 Step 4.1: スマート圧縮 ＆ 4Q モメンタム評価 ✅
- **中間カット（head-tail）を完全撤去。** 決算資料では中盤にセグメント業績・
  ガイダンス・Q&A が集中するため、中間削除は分析上 NG という指摘を受けての対応
- `src/lib/prompts/condense.ts` を新設。構造分割 → 価値採点 → 予算配分 →
  文単位の抽出、という流れに変更。**要約ではなく原文抽出**なので事実の改変が起きない
  - 定型文（免責事項・将来見通しの注意書き）は −5 点で真っ先に除外
  - **数値明細セクション（セグメント別業績など）は丸ごと優先確保**。
    一部だけ残すと「最も伸びている事業だけ欠けた表」になり誤読を招くため
  - Q&A は質問と回答を 1 単位に結合。片方だけ残らないようにした
  - 落とした箇所には `…（N文を省略）…` を必ず挿入
- **四半期推移（4Q）とモメンタム**を追加
  - `src-tauri/src/quarterly.rs` を新設。Yahoo（売上・純利益・EPS）と
    SEC XBRL（YoY 比較対象）を統合
  - UI に `QuarterlyTrend`（TradingView 風）。売上高 / 純利益 / 純利益率 / EPS を切替、
    「⏫ 成長が加速 / ⏬ 成長が減速」バッジを表示
  - プロンプトに四半期テーブルを追加し、system で
    「YoY を主軸」「減速ならスコア 3 以下」「QoQ だけで加速と結論づけない」を厳守させた
- **実 API で確認した制約**（`docs/設計.md` 6.8 に記載）
  - Yahoo は四半期粒度で粗利・営業利益・キャッシュフローを返さない（0 / null）
  - Yahoo の四半期履歴は 4 期分のみ → そのままでは YoY を計算できない
  - SEC XBRL なら 30 四半期分あり、**期末日の突き合わせ**で YoY を算出。
    AAPL で +16.4% となり Yahoo の公表値と一致
  - 10-Q には第4四半期が含まれないため、インデックスで 4 つ前を見る方法は誤り
- **検証中に 3 件の欠陥を発見して修正**
  - 連続する見出しでセクション名が上書きされ、「質疑応答」の章題が消えていた
  - トークン数で割る評価だと短い文が優先され、情報量の多い行
    （「サービス部門の売上高は287億ドル…」）が落ちていた → 0.35 乗に緩和
  - Q&A を 1 問ずつ別セクションに割ると、Q&A だけで予算を食い尽くしていた

### 2026-08-01 — Phase 2 Step 4: Prompt Engine ＆ 20項目ファンダメンタル評価 ✅
- **Step 3 の微修正**
  - PPTX 対応（`ppt/slides/slideN.xml` の `<a:t>` を抽出。発表者ノートも取り込む）
  - チップに ✏️ リネームアイコンを追加（ダブルクリックのみだった操作を明示的に）
  - ドロップゾーンに「※ URL ではなくローカルのファイル」の注記を追加
- **プロンプトエンジン**（`src/lib/prompts/`）
  - `criteria.ts` — 20項目を 1 ファイルに集約。ここだけ差し替えれば評価軸を変えられる
  - `systemPrompt.ts` — 出力フォーマットを厳密に指定。幻覚対策として
    「資料に無いことを断定しない」「判断不能はスコア 0」「数値の出所を明記」を厳守事項に
  - `buildPrompt.ts` — 財務指標 → 添付資料 → SEC の優先度で予算配分。
    SEC は Risk Factors / MD&A 等の重要節を優先抽出
  - `parseAnalysis.ts` — Markdown テーブルを構造化。**ストリーミング途中でも解釈できる**
  - `analysisRunner.ts` — 資料収集 → プロンプト構築 → 生成 のオーケストレーション
- **UI**
  - `AnalysisPanel` を全面刷新。20項目のスコアバー、強み / リスク / バリュエーション所見 /
    総合投資判断を逐次描画。平均スコアをヘッダに表示
  - 「AI分析を実行」ボタンと、生成中に切り替わる「中断」ボタン
- **中断機能**（Rust）
  - `requestId` で識別し、`llm_cancel` で SSE 読み取りループを抜ける。
    それまでの生成テキストは破棄しない
- **バグを 1 件検出して修正**
  - `headTail` がトークン→文字数の逆算に固定係数 2.5 を使っており、
    日本語資料で **上限を 21% 超過**していた（26,633 tok / 上限 22,000）。
    文章自身の「文字あたりトークン数」から逆算する方式に変更し、
    さらに全体での最終検算（`enforceLimit`）を追加
  - 資料ごとの配分も「均等割り → 余りを再配分」に改め、予算利用率を 74% → 98% に改善
- **Node 上で実データ検証**
  - PPTX: スライド 2 枚 + 発表者ノートを正しく抽出
  - パーサ: 20/20 行、平均スコア、強み・リスク・所見・判断すべて正しく構造化。
    途中経過（5 行時点）でも破綻せず解釈
  - 予算: 上限 30,000（出力用 8,000 確保）に対し 21,616 tok で収まり、
    重要 3 節すべてがプロンプトに含まれることを確認

### 2026-08-01 — Phase 2 Step 3: 一次資料の解析 ＆ ステージングキャッシュ管理 ✅
- **テキスト抽出**（すべてフロント側・ローカル完結）
  - PDF: `pdfjs-dist`。1MB 超あるため**動的 import** にし、メインバンドルを 258KB に維持
    （静的 import だと 690KB まで膨らんだ）
  - DOCX: `fflate` で ZIP を展開し `word/document.xml` からタグ除去。専用ライブラリ不要
  - HTML / TXT / MD / CSV / JSON にも対応
  - PDF は `--- p.N ---` のページ区切りを入れ、出典を追えるようにした
- **ステージング**（`src-tauri/src/documents.rs`）
  - `<app_data_dir>/temp_documents/` に抽出テキストと `index.json` を保存。再起動後も保持
  - **元のバイナリは複製しない**（理由は `docs/設計.md` 6.6 に記載）
- **UI**（ドロップゾーンの直下に常設トレイ）
  - 🟢 バッジ付きチップ / クリックでプレビュー / ダブルクリックでリネーム / ✕ で削除 / 一括クリア
  - 取り込み中は「抽出中 → 保存中」の 2 段階を表示
  - トークンメーター（🟢 <75% / 🟡 75-100% / 🔴 ≧100%）
- **トークン概算**は `CJK文字数 + ceil(その他/4)`。Rust と TS の両方に同じ規則を置いた
- **Node 上で実データ検証**
  - PDF: 生成した検証用 PDF から 3 行を正しく抽出、概算 25 トークンを算出
  - DOCX: 段落・タブ・改行・実体参照・日本語すべて正しく抽出

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
