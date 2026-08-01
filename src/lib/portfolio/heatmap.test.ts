import { describe, expect, it } from "vitest";
import type { ArchiveEntry } from "@/types";
import {
  buildHeatmap,
  buildTransferText,
  quarterKey,
  quarterOrder,
} from "@/lib/portfolio/heatmap";

function entry(over: Partial<ArchiveEntry> & { ticker: string }): ArchiveEntry {
  return {
    id: `${over.ticker}-${over.periodLabel ?? over.savedAtMs ?? 0}`,
    provider: "anthropic",
    model: "claude-opus-5",
    averageScore: null,
    periodLabel: null,
    record: "{}",
    savedAtMs: 0,
    ...over,
  };
}

describe("quarterKey / quarterOrder", () => {
  it("`FY2026 Q3` を `FY26-Q3` にそろえる", () => {
    expect(quarterKey(entry({ ticker: "AAPL", periodLabel: "FY2026 Q3" }))).toBe("FY26-Q3");
    expect(quarterKey(entry({ ticker: "AAPL", periodLabel: "2026Q1" }))).toBe("FY26-Q1");
  });

  it("ラベルが無ければ保存日時から作る", () => {
    const ms = new Date(2026, 7, 2).getTime();
    expect(quarterKey(entry({ ticker: "AAPL", savedAtMs: ms }))).toBe("FY26-Q3");
  });

  it("新しい期ほど大きい値になる", () => {
    expect(quarterOrder("FY26-Q3")).toBeGreaterThan(quarterOrder("FY26-Q2"));
    expect(quarterOrder("FY26-Q1")).toBeGreaterThan(quarterOrder("FY25-Q4"));
    expect(quarterOrder("不明")).toBe(-1);
  });
});

describe("buildHeatmap", () => {
  const entries = [
    entry({ ticker: "AAPL", periodLabel: "FY26 Q3", averageScore: 4.2, savedAtMs: 300 }),
    entry({ ticker: "AAPL", periodLabel: "FY26 Q2", averageScore: 3.4, savedAtMs: 200 }),
    entry({ ticker: "NVDA", periodLabel: "FY26 Q3", averageScore: 2.1, savedAtMs: 250 }),
  ];

  it("銘柄 × 四半期の表になる", () => {
    const map = buildHeatmap(entries);
    expect(map.quarters).toEqual(["FY26-Q3", "FY26-Q2"]);
    expect(map.rows.map((r) => r.ticker)).toEqual(["AAPL", "NVDA"]);
    expect(map.rows[0].cells["FY26-Q3"].score).toBe(4.2);
  });

  it("**列は全銘柄の和集合**（分析した期が違っても抜けない）", () => {
    const map = buildHeatmap(entries);
    // NVDA は Q2 を分析していないが、列としては存在する
    expect(map.rows[1].cells["FY26-Q2"].score).toBeNull();
    expect(map.rows[1].cells["FY26-Q2"].entryId).toBeNull();
  });

  it("列は新しい期が左に来る", () => {
    const map = buildHeatmap([
      entry({ ticker: "A", periodLabel: "FY25 Q1", savedAtMs: 1 }),
      entry({ ticker: "A", periodLabel: "FY26 Q4", savedAtMs: 2 }),
      entry({ ticker: "A", periodLabel: "FY26 Q1", savedAtMs: 3 }),
    ]);
    expect(map.quarters).toEqual(["FY26-Q4", "FY26-Q1", "FY25-Q1"]);
  });

  it("スコアから 🟢🟡🔴 を割り当てる", () => {
    const map = buildHeatmap(entries);
    expect(map.rows[0].cells["FY26-Q3"].statusIcon).toBe("🟢");
    expect(map.rows[0].cells["FY26-Q2"].statusIcon).toBe("🟡");
    expect(map.rows[1].cells["FY26-Q3"].statusIcon).toBe("🔴");
  });

  it("スコアが無い期は色を付けない（判定不能を「悪い」と見せない）", () => {
    const map = buildHeatmap([
      entry({ ticker: "A", periodLabel: "FY26 Q1", averageScore: null, savedAtMs: 1 }),
    ]);
    expect(map.rows[0].cells["FY26-Q1"].statusIcon).toBe("");
    expect(map.rows[0].cells["FY26-Q1"].status).toBeNull();
  });

  it("**同じ期に複数回分析していたら最新を採る**", () => {
    const map = buildHeatmap([
      entry({ id: "old", ticker: "A", periodLabel: "FY26 Q1", averageScore: 2, savedAtMs: 100 }),
      entry({ id: "new", ticker: "A", periodLabel: "FY26 Q1", averageScore: 5, savedAtMs: 200 }),
    ]);
    expect(map.rows[0].cells["FY26-Q1"].score).toBe(5);
    expect(map.rows[0].cells["FY26-Q1"].entryId).toBe("new");
    expect(map.rows[0].count).toBe(1);
  });

  it("行は直近の分析が新しい銘柄から並ぶ", () => {
    const map = buildHeatmap([
      entry({ ticker: "OLD", periodLabel: "FY26 Q1", savedAtMs: 100 }),
      entry({ ticker: "NEW", periodLabel: "FY26 Q1", savedAtMs: 900 }),
    ]);
    expect(map.rows.map((r) => r.ticker)).toEqual(["NEW", "OLD"]);
  });

  it("銘柄を指定するとその順・その銘柄だけになる", () => {
    const map = buildHeatmap(entries, ["NVDA", "MSFT"]);
    expect(map.rows.map((r) => r.ticker)).toEqual(["NVDA", "MSFT"]);
    expect(map.rows[1].count).toBe(0);
  });

  it("履歴が空でも落ちない", () => {
    expect(buildHeatmap([])).toEqual({ quarters: [], rows: [] });
  });
});

describe("buildTransferText（全期の一括転送）", () => {
  const entries = [
    { label: "FY26-Q3", score: 4.2, savedAtMs: Date.UTC(2026, 6, 1), body: "Q3 の本文" },
    { label: "FY26-Q2", score: 3.4, savedAtMs: Date.UTC(2026, 3, 1), body: "Q2 の本文" },
  ];

  it("期ごとに見出しで区切る（どこからどこまでが 1 期か分かる）", () => {
    const text = buildTransferText("AAPL", entries);
    expect(text).toContain("### FY26-Q3");
    expect(text).toContain("### FY26-Q2");
    expect(text).toContain("Q3 の本文");
    expect(text).toContain("Q2 の本文");
  });

  it("銘柄と期数を明示する", () => {
    const text = buildTransferText("AAPL", entries);
    expect(text).toContain("AAPL の過去 2 期分");
    expect(text).toContain('ticker="AAPL"');
    expect(text).toContain('期数="2"');
  });

  it("時系列での変化を見るよう指示する", () => {
    expect(buildTransferText("AAPL", entries)).toContain("時系列での変化");
  });

  it("スコアが無い期も落とさない", () => {
    const text = buildTransferText("AAPL", [
      { label: "FY26-Q1", score: null, savedAtMs: 0, body: "本文" },
    ]);
    expect(text).toContain("総合 —");
    expect(text).toContain("本文");
  });

  it("履歴が無ければその旨だけ返す", () => {
    expect(buildTransferText("AAPL", [])).toBe("AAPL の過去の分析データはまだありません。");
  });
});
