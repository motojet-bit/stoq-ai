import { describe, expect, it } from "vitest";
import {
  ANALYSIS_STEPS,
  PROGRESS_STAGES,
  mergeSteps,
  nextStep,
  progressRatio,
  scoreRowsOnly,
  stepInstruction,
  usableSteps,
} from "@/lib/prompts/analysisSteps";
import { CRITERIA } from "@/lib/prompts/criteria";
import { setLocale } from "@/lib/i18n/i18n";

// 文面を日本語で確かめる。**トップレベルで切り替える**（定数は読み込み時に組み上がる）
setLocale("ja");

describe("段の定義", () => {
  it("**採点段で 20 項目を過不足なく覆う**（1 つでも抜けると表に穴が空く）", () => {
    const covered = ANALYSIS_STEPS.flatMap((s) =>
      s.range ? Array.from({ length: s.range.to - s.range.from + 1 }, (_, i) => s.range!.from + i) : [],
    );
    expect(covered).toEqual(CRITERIA.map((c) => c.id));
  });

  it("最終段は採点しない（全体の見直しに充てる）", () => {
    expect(ANALYSIS_STEPS[ANALYSIS_STEPS.length - 1].range).toBeNull();
  });

  it("進捗メーターは 5 段（準備 + 生成 4 段）", () => {
    expect(PROGRESS_STAGES).toBe(5);
  });
});

describe("再開の起点", () => {
  it("何も終わっていなければ第 1 段から", () => {
    expect(nextStep([])?.id).toBe(1);
  });

  it("途中まで終わっていれば続きから", () => {
    expect(nextStep([1, 2])?.id).toBe(3);
  });

  it("全部終わっていれば null", () => {
    expect(nextStep([1, 2, 3, 4])).toBeNull();
  });

  it("**歯抜けは土台にしない**（後段は前段を読んで書かれている）", () => {
    expect(usableSteps([1, 3])).toEqual([1]);
    expect(usableSteps([2, 3])).toEqual([]);
    expect(usableSteps([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("進捗率", () => {
  it("準備段から 0 より大きい（止まって見えると不安になる）", () => {
    expect(progressRatio(0, false)).toBeGreaterThan(0);
  });

  it("走っている間は次の段の途中まで進む", () => {
    expect(progressRatio(1, true)).toBeGreaterThan(progressRatio(1, false));
  });

  it("1 を超えない", () => {
    expect(progressRatio(4, true)).toBeLessThanOrEqual(1);
  });
});

describe("段ごとの指示", () => {
  it("採点段は範囲を明示する", () => {
    const text = stepInstruction(ANALYSIS_STEPS[0], "");
    expect(text).toContain("# 1");
    expect(text).toContain("# 7");
  });

  it("**採点段には直前の出力を渡さない**（雪だるま式のトークン膨張を防ぐ）", () => {
    for (const step of ANALYSIS_STEPS.filter((s) => s.range !== null)) {
      expect(stepInstruction(step, "前の段で書いた長い本文")).not.toContain("前の段で書いた長い本文");
    }
  });

  it("最終段は死角チェックを求め、評価テーブルの行を受け取る", () => {
    const text = stepInstruction(ANALYSIS_STEPS[3], "| 1 | A | 4 | 良好 | 根拠 |");
    expect(text).toContain("死角チェック");
    expect(text).toContain("矛盾");
    expect(text).toContain("| 1 | A |");
  });
});

describe("最終段へ渡す本文の絞り込み", () => {
  it("**評価テーブルの行だけを残す**（前置きや節は見直しに要らない）", () => {
    const merged = [
      "## 評価テーブル",
      "| # | 項目 | スコア | 評価 | 根拠 |",
      "| --- | --- | --- | --- | --- |",
      "| 1 | A | 4 | 良好 | 根拠 |",
      "| 2 | B | 3 | 普通 | 根拠 |",
      "",
      "## 強み",
      "- 良い",
    ].join("\n");
    const rows = scoreRowsOnly(merged);
    expect(rows).toContain("| 1 | A |");
    expect(rows).toContain("| 2 | B |");
    expect(rows).not.toContain("## 強み");
    expect(rows).not.toContain("| # | 項目");
  });

  it("行が無ければ空", () => {
    expect(scoreRowsOnly("## 強み\n- 良い")).toBe("");
  });
});

describe("段の結合", () => {
  it("**テーブルのヘッダーを補う**（各段は本文の行しか書かないため）", () => {
    const merged = mergeSteps([
      { id: 1, raw: "| 1 | A | 4 | 良好 | 根拠 |" },
      { id: 2, raw: "| 8 | B | 3 | 普通 | 根拠 |" },
    ]);
    expect(merged).toContain("## 評価テーブル");
    expect(merged).toContain("| # | 項目 | スコア | 評価 | 根拠 |");
    expect(merged).toContain("| 1 | A |");
    expect(merged).toContain("| 8 | B |");
  });

  it("**モデルが付けてきたヘッダー行は落とす**（表の途中に挟まると行を取り違える）", () => {
    const merged = mergeSteps([
      { id: 2, raw: "| # | 項目 | スコア | 評価 | 根拠 |\n| --- | --- | --- | --- | --- |\n| 8 | B | 3 | 普通 | 根拠 |" },
    ]);
    expect(merged.match(/\| # \| 項目/g)).toHaveLength(1);
  });

  it("最終段は表の後ろに続ける", () => {
    const merged = mergeSteps([
      { id: 1, raw: "| 1 | A | 4 | 良好 | 根拠 |" },
      { id: 4, raw: "## 強み\n\n- 良い" },
    ]);
    expect(merged.indexOf("| 1 | A |")).toBeLessThan(merged.indexOf("## 強み"));
  });

  it("途中までしか無くても組み立てられる（切れても読める形で残す）", () => {
    expect(mergeSteps([{ id: 1, raw: "| 1 | A | 4 | 良好 | 根拠 |" }])).toContain("| 1 | A |");
  });

  it("空なら空文字", () => {
    expect(mergeSteps([])).toBe("");
  });
});
