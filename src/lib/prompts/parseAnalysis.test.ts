import { describe, expect, it } from "vitest";
import { parseAnalysis } from "@/lib/prompts/parseAnalysis";
import { CRITERIA } from "@/lib/prompts/criteria";
import { criterionLabel } from "@/lib/prompts/criteria";
import { setLocale } from "@/lib/i18n/i18n";

/*
 * 文面は日本語で検証する（既定は英語なので明示的に切り替える）。
 * **トップレベルで呼ぶ。** モジュール直下で組み立てられる定数が
 * あるため、`beforeAll` では間に合わない。
 */
setLocale("ja");

function tableRows(count: number): string {
  return CRITERIA.slice(0, count)
    .map((c) => `| ${c.id} | ${criterionLabel(c.id)} | ${(c.id % 5) + 1} | 良好 | 根拠${c.id}。 |`)
    .join("\n");
}

const FULL = `## 評価テーブル

| # | 項目 | スコア | 評価 | 根拠 |
| --- | --- | --- | --- | --- |
${tableRows(CRITERIA.length)}

## 強み

- 粗利率が高水準。
- FCF が潤沢。

## リスク

- 顧客集中。

## バリュエーション所見

PER 35倍はやや割高。

## 総合投資判断

中立。`;

describe("parseAnalysis", () => {
  it("完全な出力を構造化できる", () => {
    const r = parseAnalysis(FULL);
    expect(r.rows).toHaveLength(CRITERIA.length);
    expect(r.complete).toBe(true);
    expect(r.strengths).toHaveLength(2);
    expect(r.risks).toHaveLength(1);
    expect(r.valuation).toContain("PER 35倍");
    expect(r.conclusion).toBe("中立。");
    expect(r.averageScore).not.toBeNull();
  });

  // --- エッジケース：壊れた入力でも例外を投げないこと ---

  it("空文字でも落ちない", () => {
    const r = parseAnalysis("");
    expect(r.rows).toEqual([]);
    expect(r.complete).toBe(false);
    expect(r.averageScore).toBeNull();
    expect(r.strengths).toEqual([]);
  });

  it("ストリーミング途中（テーブルが途切れている）でも解釈できる", () => {
    const partial = FULL.slice(0, FULL.indexOf("| 6 |"));
    const r = parseAnalysis(partial);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.length).toBeLessThan(CRITERIA.length);
    expect(r.complete).toBe(false);
  });

  it("Markdown でない文章を渡しても落ちない", () => {
    const r = parseAnalysis("すみません、その質問には回答できません。");
    expect(r.rows).toEqual([]);
    expect(r.conclusion).toBe("");
  });

  it("列が足りない行は無視する", () => {
    const r = parseAnalysis("## 評価テーブル\n| 1 | 事業モデルの明瞭さ |\n");
    expect(r.rows).toEqual([]);
  });

  it("範囲外のスコアは null にする", () => {
    const r = parseAnalysis(
      "## 評価テーブル\n| 1 | 事業モデルの明瞭さ | 99 | 良好 | 根拠 |\n",
    );
    expect(r.rows[0].score).toBeNull();
  });

  it("スコア 0（判定不能）は平均から除外する", () => {
    const md =
      "## 評価テーブル\n" +
      "| 1 | 事業モデルの明瞭さ | 0 | 判定不能 | 資料なし |\n" +
      "| 2 | 競争優位（モート） | 4 | 良好 | 根拠 |\n";
    const r = parseAnalysis(md);
    expect(r.averageScore).toBe(4);
  });

  it("重複した行番号は後勝ちで 1 行にまとめる", () => {
    const md =
      "## 評価テーブル\n" +
      "| 1 | 事業モデルの明瞭さ | 2 | 懸念 | 旧 |\n" +
      "| 1 | 事業モデルの明瞭さ | 5 | 非常に良好 | 新 |\n";
    const r = parseAnalysis(md);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].score).toBe(5);
  });

  it("見出しだけあって中身が無くても落ちない", () => {
    const r = parseAnalysis("## 強み\n\n## リスク\n\n## 総合投資判断\n");
    expect(r.strengths).toEqual([]);
    expect(r.conclusion).toBe("");
  });

  it("非常に長い入力でも処理できる", () => {
    const r = parseAnalysis(FULL + "\n" + "あ".repeat(200_000));
    expect(r.rows).toHaveLength(CRITERIA.length);
  });
});
