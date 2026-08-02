import { describe, expect, it } from "vitest";
import type { Fundamentals, QuarterlySeries, SavedAnalysis } from "@/types";
import { CRITERIA } from "@/lib/prompts/criteria";
import { criterionLabel } from "@/lib/prompts/criteria";
import {
  bestTickerFor,
  buildBlocks,
  buildColumn,
  buildComparison,
  cashRunway,
  COMPARE_METRICS,
  evPerGrossProfit,
  MAX_COMPARE,
  revenueGrowth,
  blockLabel,
  SCORE_BLOCKS,
  type CompareSource,
} from "@/lib/compare/compareData";
import { setLocale } from "@/lib/i18n/i18n";

/*
 * 文面は日本語で検証する（既定は英語なので明示的に切り替える）。
 * **トップレベルで呼ぶ。** モジュール直下で組み立てられる定数が
 * あるため、`beforeAll` では間に合わない。
 */
setLocale("ja");

// ---------------------------------------------------------------- 素材

function metric(label: string, value: string, raw: number | null) {
  return { label, value, raw };
}

function fundamentals(over: Partial<Fundamentals> = {}): Fundamentals {
  return {
    ticker: "AAPL",
    name: "Apple Inc.",
    currency: "USD",
    exchange: "NasdaqGS",
    price: 231.5,
    priceDisplay: "231.50 USD",
    changePercent: 1.2,
    warning: null,
    fetchedAtMs: 0,
    groups: [
      {
        title: "株価・規模",
        metrics: [metric("時価総額", "3.50兆 USD", 3.5e12)],
      },
      {
        title: "バリュエーション",
        metrics: [
          metric("PER（実績）", "31.20", 31.2),
          metric("EV / 売上高", "8.00", 8),
        ],
      },
      {
        title: "成長性",
        metrics: [metric("売上成長率（YoY）", "6.10%", 6.1)],
      },
      {
        title: "収益性",
        metrics: [
          metric("粗利率", "46.20%", 46.2),
          metric("営業利益率", "31.50%", 31.5),
          metric("ROE", "150.00%", 150),
        ],
      },
      {
        title: "キャッシュ・財務健全性",
        metrics: [
          metric("営業CF", "1180.00億 USD", 1.18e11),
          metric("現金・同等物", "670.00億 USD", 6.7e10),
          metric("負債比率 (D/E)", "150.00", 150),
        ],
      },
    ],
    ...over,
  };
}

/** 20項目すべてに同じスコアを入れた分析結果テキスト */
function analysisMarkdown(scoreOf: (id: number) => number): string {
  const rows = CRITERIA.map(
    (c) => `| ${c.id} | ${criterionLabel(c.id)} | ${scoreOf(c.id)} | 良好 | 根拠 |`,
  ).join("\n");

  return `## 評価テーブル

| # | 項目 | スコア | 評価 | 根拠 |
| --- | --- | --- | --- | --- |
${rows}

## 強み

- 強み1

## リスク

- リスク1

## バリュエーション所見

所見。

## 総合投資判断

中立。`;
}

function saved(raw: string): SavedAnalysis {
  return {
    ticker: "AAPL",
    raw,
    provider: "anthropic",
    model: "claude-opus-5",
    promptTokens: 1000,
    notes: [],
    basis: ["財務指標(YF)"],
    record: "{}",
    savedAtMs: 1_700_000_000_000,
  };
}

function source(over: Partial<CompareSource> = {}): CompareSource {
  return {
    ticker: "AAPL",
    fundamentals: fundamentals(),
    quarterly: null,
    analysis: saved(analysisMarkdown(() => 4)),
    ...over,
  };
}

// ---------------------------------------------------------------- テスト

describe("スコアブロックの定義", () => {
  it("20項目すべてがどれかのブロックに入っている", () => {
    const assigned = SCORE_BLOCKS.flatMap((b) => b.criteria).sort((a, b) => a - b);
    expect(assigned).toEqual(CRITERIA.map((c) => c.id));
  });

  it("同じ項目が 2 つのブロックに重複していない", () => {
    const assigned = SCORE_BLOCKS.flatMap((b) => b.criteria);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("指定された 5 ブロックがそろっている", () => {
    expect(SCORE_BLOCKS.map((b) => blockLabel(b.id))).toEqual([
      "成長性",
      "財務生存性",
      "経済性",
      "競争優位性",
      "バリュエーション",
    ]);
  });
});

describe("buildBlocks", () => {
  it("ブロックごとの平均を出す", () => {
    // 成長性 = 項目 3,4,14,19
    const scores = new Map([
      [3, 5],
      [4, 3],
      [14, 4],
      [19, 4],
    ]);
    const growth = buildBlocks(scores).find((b) => b.id === "growth")!;
    expect(growth.score).toBe(4);
  });

  it("**スコア 0（判定不能）は平均から除く**（資料不足を悪いと読ませない）", () => {
    const scores = new Map([
      [3, 4],
      [4, 0],
      [14, 4],
      [19, 0],
    ]);
    expect(buildBlocks(scores).find((b) => b.id === "growth")!.score).toBe(4);
  });

  it("対象が 1 つも無いブロックは null", () => {
    expect(buildBlocks(new Map()).every((b) => b.score === null)).toBe(true);
  });

  it("小数第 1 位まで丸める", () => {
    const scores = new Map([
      [5, 4],
      [6, 5],
      [9, 4],
    ]);
    expect(buildBlocks(scores).find((b) => b.id === "profitability")!.score).toBe(4.3);
  });
});

describe("Cash Runway", () => {
  it("営業CF が赤字なら残存月数を出す", () => {
    const f = fundamentals({
      groups: [
        {
          title: "キャッシュ・財務健全性",
          metrics: [
            metric("現金・同等物", "120.00億", 1.2e10),
            metric("営業CF", "-60.00億", -6e9),
          ],
        },
      ],
    });
    // 月間バーン 5e8 → 24 か月
    expect(cashRunway(f)).toEqual({ display: "24.0 か月", raw: 24 });
  });

  it("**営業CF が黒字なら 0 か月と誤読させない**", () => {
    expect(cashRunway(fundamentals())).toEqual({ display: "営業CF黒字", raw: null });
  });

  it("必要な指標が欠けていれば — を返す", () => {
    const f = fundamentals({ groups: [] });
    expect(cashRunway(f)).toEqual({ display: "—", raw: null });
    expect(cashRunway(null)).toEqual({ display: "—", raw: null });
  });
});

describe("EV / 粗利", () => {
  it("EV/売上高 と 粗利率 から導出する", () => {
    // 8 ÷ 0.462 = 17.3
    expect(evPerGrossProfit(fundamentals()).display).toBe("17.3 倍");
  });

  it("粗利率が 0 以下なら計算しない（ゼロ除算・無意味な値を避ける）", () => {
    const f = fundamentals({
      groups: [
        {
          title: "x",
          metrics: [metric("EV / 売上高", "8.00", 8), metric("粗利率", "0.00%", 0)],
        },
      ],
    });
    expect(evPerGrossProfit(f)).toEqual({ display: "—", raw: null });
  });

  it("指標が無ければ — を返す", () => {
    expect(evPerGrossProfit(null)).toEqual({ display: "—", raw: null });
  });
});

describe("売上成長率", () => {
  const quarterly = (latestYoy: number | null): QuarterlySeries => ({
    ticker: "AAPL",
    currency: "USD",
    quarters: [],
    momentum: {
      latestYoy,
      previousYoy: null,
      accelerating: null,
      marginImproving: null,
      summary: "",
    },
    source: "test",
    note: null,
    fetchedAtMs: 0,
  });

  it("**四半期の YoY を優先する**（指標より新しいため）", () => {
    expect(revenueGrowth(fundamentals(), quarterly(16.4))).toEqual({
      display: "16.4%",
      raw: 16.4,
    });
  });

  it("四半期が無ければ指標にフォールバックする", () => {
    expect(revenueGrowth(fundamentals(), null).raw).toBe(6.1);
    expect(revenueGrowth(fundamentals(), quarterly(null)).raw).toBe(6.1);
  });
});

describe("buildColumn", () => {
  it("分析済みならスコアとブロックが入る", () => {
    const column = buildColumn(source());
    expect(column.analyzed).toBe(true);
    expect(column.notice).toBeNull();
    expect(column.averageScore).toBe(4);
    expect(column.blocks).toHaveLength(5);
    expect(column.blocks.every((b) => b.score === 4)).toBe(true);
    expect(column.savedAtMs).toBe(1_700_000_000_000);
  });

  it("**未分析なら案内文を出し、市場データだけは並べる**", () => {
    const column = buildColumn(source({ analysis: null }));
    expect(column.analyzed).toBe(false);
    expect(column.notice).toBe(
      "Apple Inc. の分析データが未作成です。先に単体分析を実行してください",
    );
    expect(column.blocks.every((b) => b.score === null)).toBe(true);
    // 市場データは取れていれば見せる
    expect(column.metrics.price.display).toBe("231.50 USD");
  });

  it("市場データも分析も無ければティッカー名で案内する", () => {
    const column = buildColumn({
      ticker: "NVDA",
      fundamentals: null,
      quarterly: null,
      analysis: null,
    });
    expect(column.name).toBe("NVDA");
    expect(column.notice).toContain("NVDA の分析データが未作成です");
    expect(column.metrics.price.display).toBe("—");
  });

  it("サマリー行の指標がすべて埋まる（欠けても — で存在する）", () => {
    const column = buildColumn(source());
    for (const row of COMPARE_METRICS) {
      expect(column.metrics[row.key]).toBeDefined();
      expect(typeof column.metrics[row.key].display).toBe("string");
    }
  });

  it("ブロックごとにスコアが違う分析でも正しく集計する", () => {
    // 成長性(3,4,14,19)だけ 2、他は 5
    const raw = analysisMarkdown((id) => ([3, 4, 14, 19].includes(id) ? 2 : 5));
    const column = buildColumn(source({ analysis: saved(raw) }));

    expect(column.blocks.find((b) => b.id === "growth")!.score).toBe(2);
    expect(column.blocks.find((b) => b.id === "profitability")!.score).toBe(5);
  });
});

describe("buildComparison", () => {
  it("複数銘柄を横並びに整える", () => {
    const view = buildComparison([
      source({ ticker: "AAPL" }),
      source({ ticker: "MSFT", analysis: null }),
    ]);

    expect(view.columns.map((c) => c.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(view.notices).toHaveLength(1);
    expect(view.notices[0]).toContain("先に単体分析を実行してください");
  });

  it(`最大 ${MAX_COMPARE} 社までに切る`, () => {
    const many = Array.from({ length: 8 }, (_, i) => source({ ticker: `T${i}` }));
    expect(buildComparison(many).columns).toHaveLength(MAX_COMPARE);
  });

  it("全部分析済みなら案内は出ない", () => {
    const view = buildComparison([source({ ticker: "AAPL" }), source({ ticker: "MSFT" })]);
    expect(view.notices).toEqual([]);
  });

  it("空の選択でも落ちない", () => {
    expect(buildComparison([])).toEqual({ columns: [], notices: [] });
  });
});

describe("bestTickerFor（強調表示）", () => {
  const columns = buildComparison([
    source({ ticker: "AAPL" }),
    source({
      ticker: "MSFT",
      fundamentals: fundamentals({
        name: "Microsoft",
        groups: [
          {
            title: "収益性",
            metrics: [metric("ROE", "40.00%", 40)],
          },
          {
            title: "バリュエーション",
            metrics: [metric("PER（実績）", "40.00", 40)],
          },
        ],
      }),
    }),
  ]).columns;

  it("高いほど良い指標は最大値を選ぶ", () => {
    expect(bestTickerFor(columns, "roe")).toBe("AAPL"); // 150% > 40%
  });

  it("**低いほど良い指標は最小値を選ぶ**（PER・D/E など）", () => {
    expect(bestTickerFor(columns, "per")).toBe("AAPL"); // 31.2 < 40
  });

  it("比較できる値が 1 つ以下なら強調しない", () => {
    expect(bestTickerFor(columns.slice(0, 1), "roe")).toBeNull();
    expect(bestTickerFor(columns, "cashRunway")).toBeNull();
  });

  it("全部同じ値なら誰も「いちばん」にしない", () => {
    const same = buildComparison([
      source({ ticker: "A" }),
      source({ ticker: "B" }),
    ]).columns;
    expect(bestTickerFor(same, "roe")).toBeNull();
  });
});
