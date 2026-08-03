# HANDOFF — 新セッションへの引き継ぎ

作成日: 2026-08-03 / 対象: StoQ AI Analyzer（株究）

> **最初に読むもの**: `CLAUDE.md`（作業ルール）→ `PROGRESS.md`（状況と TODO）→ このファイル。
> 直近の改修内容は `改修記録.md` の先頭（第 79 章）にある。

---

## 0. 最重要 — 依頼された「次にやるべき改修」は**すでに完了している**

引き継ぎ依頼では次の 3 点が「新セッションで直ちに実行すべきタスク」として挙げられていた。

| 依頼された改修 | 状態 |
| --- | --- |
| HTTP タイムアウトを 300 秒へ延長 | **完了**（ただし単純な延長では不足。→ 3.2） |
| 推論モデルのパラメータ自動適合 | **完了**（`c29c6ae`） |
| 200 OK 以外の生レスポンスボディを生ログへ | **完了**（`54b2f7b`） |

**同じ改修をもう一度やらないこと。** 残っているのは**実機での確認**だけである（→ 4.）。

---

## 1. 現在のステータス

### Git

| 項目 | 値 |
| --- | --- |
| ブランチ | `main`（push 済み） |
| 最新コミット | `774b455` docs: 第79章のコミットハッシュを記入 |
| 実装コミット | `54b2f7b` fix: 推論モデルの失敗原因を生ログに残す |
| その前 | `c29c6ae` feat: 推論モデル対応（待ち時間・パラメータ補正・思考中表示） |
| 未コミットの変更 | **なし**（`git status` はクリーン） |

### テスト

```
npm run verify                                          # typecheck → test → build
cargo test --manifest-path src-tauri\Cargo.toml --lib
```

- フロント **1,031 件** / Rust **285 件** — いずれも全通過（2026-08-03 時点）
- vitest は `src/**/*.test.ts` のみを拾う（`.tsx` は対象外）
- `localized.test.ts` が**直書き日本語を検出して落とす**。UI 文言は必ず `t()` 経由にする

### 完了している主な機能（第 65〜79 章）

**分析の完走を守る六重防御**（第 78 章まで）

1. **MapReduce 分割** — `src/lib/prompts/mapReduce.ts`。`SPLIT_THRESHOLD_TOKENS = 10_000`、
   `CHUNK_TARGET_TOKENS = 5_000`。**target < threshold を崩さないこと**（崩すと
   分割経路に入って 1 チャンクのまま素通りする穴が開く。テストで固定してある）
2. **Map 出力の上限**（800 字）と**簡潔化プロンプト**（`prompts/output.md`）
3. **Auto-Continue** — `src/lib/llm/continuation.ts`。`finish_reason: length` を検出して
   続きを取りに行く（最大 3 回）。継ぎ目は文字窓（20 字以上）→ **行単位**の順で重複を落とす
4. **チェックポイント** — `analysis_steps` テーブル。4 段直列実行し、段ごとに保存。
   再開は「再開する」を押したときだけ
5. **チェックポイント完全破棄** — エラー画面の「最初からやり直す」
6. **ハードキャンセル** — `Notify` + `tokio::select!`（フラグ確認だけでは止まらないため）

**その他**: AIクロスディベート（2 面）、参照付き根拠出力、決算期の承認ダイアログ、
SEC 自動フォールバック、アドホック分析の入れ子ツリー、トークン消費ログ、
コスト概算、コンテキストゲージ、ローカル LLM（Ollama）のキー不要対応、
プロバイダかんたん追加（DeepSeek / SiliconFlow / OpenRouter / Groq）、
**株価フィード**（第 79 章で追加）。

---

## 2. 直面していた課題 — 原因は特定済み

**症状**: GPT-5.5 等の推論モデルで 1/4 段（Step 1〜2）のあたりで
`LLM からの応答が完了しませんでした (kind: unknown)` が出て止まる。

**原因は 1 つではなく、情報が消える箇所が 3 つ重なっていた。**

| # | 消えていた場所 | 何が起きていたか |
| --- | --- | --- |
| ① | `AppError` の `Display`（`#[error("{code}")]`） | **コードしか返さない。** ストリーミングの失敗は `LlmEvent::Error` の文字列 1 本で運ばれるため、この経路で API の返答が丸ごと落ちていた |
| ② | `llm/openai.rs::api_error` / `llm/mod.rs::ensure_success` | 本文と hint を**組み立てた上で捨てていた**（変数が未使用のまま残っていた） |
| ③ | `src/lib/llm/client.ts` | `invoke` の解決が**チャネル配信を追い越す**と、届いていないだけの応答を失敗と決めつけ、**成功した分析を捨てていた** |

`kind: unknown` になっていたのは、①②で本文が消えた結果、
`diagnose.ts` が種別を判定する材料を何も持てなかったため。

---

## 3. 実施済みの改修（第 79 章 / `54b2f7b`）

### 3.1 エラー本文を画面まで運ぶ

- `AppError::wire()` を追加 — `ERR_X: 本文` 形式。`LlmEvent::Error` はこれを使う
- `api_error` / `ensure_success` がステータスと本文を載せる
- フロントの `parseAppError` が `ERR_X: 本文` を**コードと詳細に割り直す**
- `waitForSettle`（`src/lib/llm/settleGrace.ts`、猶予 3 秒）で③の取りこぼしを解消

**結果**: 失敗すると、エラー詳細ダイアログの生ログに **API の文面がそのまま出る**。
「Unsupported parameter」の記載があればパラメータ側、無ければ通信側と切り分けられる。

### 3.2 タイムアウト — **単純な延長では逆効果だった**

**reqwest の `timeout` は本文の受信中も動き続ける。**
300 秒にすると「5 分以上かかる分析」が**答えを返している最中に切られる**。

そのため `src-tauri/src/http.rs` は次の構成になっている。**元に戻さないこと。**

| クライアント | 設定 |
| --- | --- |
| `client()`（市場データ） | 全体 `timeout` 60 秒 |
| `llm_client()`（LLM） | **全体制限なし** ＋ `read_timeout` 300 秒（＝無音が 300 秒続いたときだけ打ち切る） |
| 共通 | `connect_timeout` 30 秒 |

届き続けている限り何分でも待つ、というのが意図した挙動（ハートビート維持）。

### 3.3 推論モデルのパラメータ適合（`llm/openai.rs`）

- `is_reasoning_model(model)` — `o1` / `o3` / `o4` / `gpt-5` / `reasoner` / `deepseek-r1`
- `max_tokens` → **`max_completion_tokens`**
- `temperature` を**送らない**
- `reasoning_effort`（既定 `"medium"`）を付与し、**拒否されたら 1 回だけ落として再送**
- 待機中は UI に「AI が深層推論中（Reasoning…）」と表示（最初のトークンで段名へ切替）

### 3.4 診断の誤りを修正

`Unsupported parameter: 'max_tokens'` は文字列に `max_tokens` を含むため、
**「出力上限に達した」と誤診**していた（直し方が正反対になる）。
`badRequest` を新設し、パラメータ判定を `truncated` より**前**に置いた。

### 3.5 株価フィード（新規機能）

- `src-tauri/src/quote.rs` — crumb 不要の `chart` から株価・前日比・52週を取得し、
  時価総額のみ追加取得。**時価総額が取れなくても株価は返す**
- `src/components/QuoteTicker.tsx` — ティッカー入力の隣。60 秒ごとに更新。
  上げ＝緑 / 下げ＝赤に**符号と ▲▼ を必ず添える**（色だけに頼らせない）
- 取得できなければ「株価取得オフライン」と出すだけで、**操作は一切止めない**

---

## 4. 新セッションで最初にやること

### ① 実機確認（最優先・これが唯一の未検証事項）

推論モデル（GPT-5.5 等）で分析を実行し、次を確認する。

- 「AI が深層推論中（Reasoning…）」が出るか → 最初のトークンで段名へ切り替わるか
- 数分待っても打ち切られずに完走するか
- **失敗した場合**: エラー詳細ダイアログ →「生ログ」に **API の本文が出ているか**。
  出ていればそこに原因が書いてある。出ていなければ 3.1 の経路をもう一度追う

### ② 外部作業（アプリの改修ではない）

1. **`latest.json` の差し替え** — 公開中のものは URL が 404（GitHub がアセット名の
   空白をドットに置換するため）。**自動更新が動かない。**
   `gh release upload v0.1.0 -R motojet-bit/stoq-releases dist-release/latest.json --clobber`
   （`gh` CLI が未導入。要インストール）
2. **配布ビルドの更新** — 公開中の v0.1.0 には**第 66 章以降が一切入っていない**。
   LP で告知する前にバージョンを上げ、`npm run release:manifest` を回し直す
3. **資料のダウンロード** — 保存ダイアログではなく書き出しフォルダへの保存。
   保存されるのは抽出テキストで元の PDF ではない（`dialog` プラグイン未導入）

### ③ 任意（提案済み・未着手）

- **Rust 側の遅延実測テスト** — `read_timeout` の挙動を確かめるにはモックサーバー
  （`wiremock` 等）の追加が要るため未実装。遅延の検証は JS 側（`settleGrace.test.ts`）のみ
- **分割時の Map を安いモデルへ回す** — Map（抜き出し）は判断を伴わないため、
  推論モデルで回すと時間と費用が嵩む

---

## 5. 触るときに事故りやすい箇所

- **秘密情報をフロントへ渡さない。** APIキーは Rust 側（`settings.rs`）で保存し、
  フロントへは**マスク済み文字列と `configured` フラグのみ**返す
- **更新署名の秘密鍵は `~/.stoq-updater/stoq.key`（リポジトリ外）。**
  失うと二度と更新を配信できない。**内容を出力しないこと**
- **分析プロンプトは `src-tauri/src/prompts/*.md` に置き `include_str!` で読む。**
  フロントへ本文を渡さない（役割 ID・閾値・言語だけを送る）
- **`export const X = t(...)` は禁止。** モジュール読込時に訳が固定される。
  日本語を期待するテストは `setLocale("ja")` をトップレベルに置く
- **Python ヒアドキュメントで TS を書かない。** テンプレートリテラル内の `\n` が
  実際の改行に化けて何度も壊している。Write / Edit ツールを使うこと
- **ロール ID は変えない**（`growth` は表示名がマイクロキャップでも ID は据え置き）
- コミット前に `npm run verify` と `cargo test --lib` を通す。純粋ロジックにはテストを足す

---

## 6. 主要ファイルの地図

| 目的 | 場所 |
| --- | --- |
| HTTP クライアント（タイムアウト） | `src-tauri/src/http.rs` |
| LLM 共通（SSE・usage・キャンセル） | `src-tauri/src/llm/mod.rs` |
| OpenAI 互換（推論モデル判定） | `src-tauri/src/llm/openai.rs` |
| エラー型・コード | `src-tauri/src/error.rs` |
| 株価フィード | `src-tauri/src/quote.rs` / `src/components/QuoteTicker.tsx` |
| 分析の進行管理 | `src/lib/prompts/analysisRunner.ts` |
| 段の定義・分割 | `src/lib/prompts/analysisSteps.ts` / `mapReduce.ts` |
| 自動継続 | `src/lib/llm/continuation.ts` |
| 失敗の切り分け | `src/lib/errors/diagnose.ts` |
| エラー文言の変換 | `src/lib/errors/errorMessage.ts` |
| 辞書（ja / en は**キーを揃える**。テストで検査） | `src/locales/{ja,en}.json` |
