/**
 * 分析結果の見出し。
 *
 * **プロンプト本文は Rust 側（`src-tauri/src/prompts/`）にあるが、
 * この見出しだけはパーサが必要とするのでフロントにも持つ。**
 * 出力フォーマットの目印であり、分析ノウハウそのものではない。
 *
 * Rust の `output.md` と一致していること（`prompts::tests` で検証済み）。
 */
export const SECTION_HEADINGS = {
  table: "## 評価テーブル",
  strengths: "## 強み",
  risks: "## リスク",
  valuation: "## バリュエーション所見",
  conclusion: "## 総合投資判断",
} as const;
