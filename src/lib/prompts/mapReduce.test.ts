import { describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n/i18n";
import {
  CHUNK_TARGET_TOKENS,
  mapInstruction,
  needsSplit,
  reduceSource,
  splitIntoChunks,
  splitProgress,
  SPLIT_THRESHOLD_TOKENS,
} from "@/lib/prompts/mapReduce";

setLocale("ja");

const big = (tokens: number) => "word ".repeat(tokens);

describe("分割するかの判定", () => {
  it("**小さい資料は分けない**（呼び出しが増えるぶん費用と時間がかかる）", () => {
    expect(needsSplit("短い資料")).toBe(false);
  });

  it("しきい値を超えたら分ける", () => {
    expect(needsSplit(big(SPLIT_THRESHOLD_TOKENS * 2))).toBe(true);
  });
});

describe("チャンクへの分割", () => {
  it("**見出しで区切る**（文字数だけで切ると表や文が途中で割れる）", () => {
    const text = [
      "## ITEM 1. Business",
      big(CHUNK_TARGET_TOKENS),
      "## ITEM 1A. Risk Factors",
      big(CHUNK_TARGET_TOKENS),
    ].join("\n");
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.heading?.includes("ITEM 1A"))).toBe(true);
  });

  it("**見出しが無くても必ず割れる**（PDF 抽出では見出しが残らないことがある）", () => {
    const chunks = splitIntoChunks(big(CHUNK_TARGET_TOKENS * 3));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("通し番号は 1 から連番", () => {
    const chunks = splitIntoChunks(big(CHUNK_TARGET_TOKENS * 3));
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i + 1));
  });

  it("空の資料なら空", () => {
    expect(splitIntoChunks("")).toEqual([]);
    expect(splitIntoChunks("   \n  ")).toEqual([]);
  });

  it("小さい資料は 1 つのまま", () => {
    expect(splitIntoChunks("短い本文")).toHaveLength(1);
  });
});

describe("抜き出しの指示", () => {
  it("何番目かと見出しを伝える", () => {
    const text = mapInstruction({ index: 2, heading: "MD&A", text: "本文" }, 5);
    expect(text).toContain("2");
    expect(text).toContain("5");
    expect(text).toContain("MD&A");
    expect(text).toContain("本文");
  });

  it("**評価させない**（他を読まないまま下した判断が最後まで残る）", () => {
    expect(mapInstruction({ index: 1, heading: null, text: "x" }, 1)).toContain(
      "評価や点数は付けないでください",
    );
  });
});

describe("統合の材料", () => {
  it("どのチャンク由来かを残す", () => {
    const source = reduceSource([
      { index: 1, heading: "MD&A", text: "売上は増加" },
      { index: 2, heading: null, text: "訴訟リスク" },
    ]);
    expect(source).toContain("MD&A");
    expect(source).toContain("売上は増加");
    expect(source).toContain("訴訟リスク");
    expect(source).toContain("2 分割");
  });

  it("矛盾の扱いを指示する", () => {
    expect(reduceSource([{ index: 1, heading: null, text: "x" }])).toContain("矛盾");
  });

  it("空なら空文字", () => {
    expect(reduceSource([])).toBe("");
  });
});

describe("進み具合", () => {
  it("抽出が進むほど伸びる", () => {
    expect(splitProgress({ mapped: 1, total: 4, reducing: false })).toBeLessThan(
      splitProgress({ mapped: 3, total: 4, reducing: false }),
    );
  });

  it("**統合中は抽出完了より先へ進める**（止まって見えると不安になる）", () => {
    expect(splitProgress({ mapped: 4, total: 4, reducing: true })).toBeGreaterThan(
      splitProgress({ mapped: 4, total: 4, reducing: false }),
    );
  });

  it("1 を超えない", () => {
    expect(splitProgress({ mapped: 9, total: 4, reducing: true })).toBeLessThanOrEqual(1);
  });

  it("チャンクが無くても壊れない", () => {
    expect(splitProgress({ mapped: 0, total: 0, reducing: false })).toBe(0);
  });
});

describe("しきい値とチャンクの大きさの関係", () => {
  it("**チャンクの目安はしきい値より小さい**（でないと 1 つにしか割れない）", () => {
    expect(CHUNK_TARGET_TOKENS).toBeLessThan(SPLIT_THRESHOLD_TOKENS);
  });

  it("しきい値をわずかに超えた資料でも、実際に 2 つ以上へ割れる", () => {
    const text = big(Math.round(SPLIT_THRESHOLD_TOKENS * 1.1));
    expect(needsSplit(text)).toBe(true);
    expect(splitIntoChunks(text).length).toBeGreaterThan(1);
  });
});
