import { describe, expect, it } from "vitest";
import { availableQuarters, buildQuarterComparison } from "@/lib/portfolio/quarterCompare";
import type { ArchiveEntry } from "@/types";

const record = (blocks: { id: string; label: string; score: number | null }[]) =>
  JSON.stringify({
    version: 1,
    // parseAnalysisRecord は ticker と rawMarkdownOutput を必須にしている
    ticker: "AAA",
    rawMarkdownOutput: "",
    summary: { statusIcon: "🟢" },
    blockScores: blocks,
    keyMetrics: [],
    evaluations: { strengths: [], risks: [] },
  });

const entry = (over: Partial<ArchiveEntry> & { ticker: string; id: string }): ArchiveEntry => ({
  provider: null,
  model: null,
  averageScore: null,
  periodLabel: "FY26-Q3",
  record: "{}",
  parentId: null,
  branchNo: null,
  savedAtMs: 0,
  ...over,
});

describe("並べられる四半期", () => {
  it("新しい順に返す", () => {
    const list = availableQuarters([
      entry({ id: "a", ticker: "AAA", periodLabel: "FY26-Q1" }),
      entry({ id: "b", ticker: "BBB", periodLabel: "FY26-Q3" }),
    ]);
    expect(list[0]).toBe("FY26-Q3");
  });

  it("**アドホックは期の代表にしない**（期中の追加分析なので並べない）", () => {
    const list = availableQuarters([
      entry({ id: "a", ticker: "AAA", periodLabel: "FY26-Q1", parentId: "p", branchNo: 1 }),
    ]);
    expect(list).toEqual([]);
  });

  it("重複は 1 つに畳む", () => {
    const list = availableQuarters([
      entry({ id: "a", ticker: "AAA", periodLabel: "FY26-Q2" }),
      entry({ id: "b", ticker: "BBB", periodLabel: "FY26-Q2" }),
    ]);
    expect(list).toEqual(["FY26-Q2"]);
  });
});

describe("四半期の横並び比較", () => {
  it("同じ期の銘柄を並べ、ブロック別スコアを揃える", () => {
    const table = buildQuarterComparison(
      [
        entry({
          id: "a",
          ticker: "AAA",
          averageScore: 4.2,
          record: record([{ id: "growth", label: "成長性", score: 4 }]),
        }),
        entry({
          id: "b",
          ticker: "BBB",
          averageScore: 3.1,
          record: record([{ id: "growth", label: "成長性", score: 3 }]),
        }),
      ],
      "FY26-Q3",
    );
    expect(table.rows.map((r) => r.ticker)).toEqual(["AAA", "BBB"]);
    expect(table.blockLabels).toEqual([{ id: "growth", label: "成長性" }]);
    expect(table.rows[0].blocks.growth).toBe(4);
  });

  it("**平均スコアの高い順**（取れていないものは末尾）", () => {
    const table = buildQuarterComparison(
      [
        entry({ id: "a", ticker: "LOW", averageScore: 2 }),
        entry({ id: "b", ticker: "NONE", averageScore: null }),
        entry({ id: "c", ticker: "HIGH", averageScore: 4.5 }),
      ],
      "FY26-Q3",
    );
    expect(table.rows.map((r) => r.ticker)).toEqual(["HIGH", "LOW", "NONE"]);
  });

  it("**同じ銘柄が同じ期に複数あれば最新を採る**（やり直した結果のほうが確度が高い）", () => {
    const table = buildQuarterComparison(
      [
        entry({ id: "old", ticker: "AAA", averageScore: 2, savedAtMs: 100 }),
        entry({ id: "new", ticker: "AAA", averageScore: 4, savedAtMs: 200 }),
      ],
      "FY26-Q3",
    );
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].entryId).toBe("new");
  });

  it("別の期は混ざらない", () => {
    const table = buildQuarterComparison(
      [entry({ id: "a", ticker: "AAA", periodLabel: "FY26-Q1" })],
      "FY26-Q3",
    );
    expect(table.rows).toEqual([]);
  });

  it("ブロックの見出しは全銘柄の和集合（出現順を保つ）", () => {
    const table = buildQuarterComparison(
      [
        entry({ id: "a", ticker: "AAA", record: record([{ id: "x", label: "X", score: 1 }]) }),
        entry({ id: "b", ticker: "BBB", record: record([{ id: "y", label: "Y", score: 2 }]) }),
      ],
      "FY26-Q3",
    );
    expect(table.blockLabels.map((b) => b.id)).toEqual(["x", "y"]);
  });
});
