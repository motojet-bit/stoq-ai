import { describe, expect, it } from "vitest";
import type { Fundamentals } from "@/types";
import { CRITERIA } from "@/lib/prompts/criteria";
import {
  buildAnalysisRecord,
  fiscalQuarterOf,
  parseAnalysisRecord,
  serializeAnalysisRecord,
  statusOf,
  toHundred,
  type AnalysisRecord,
} from "@/lib/export/analysisRecord";
import {
  csvRow,
  escapeCsv,
  exportFileName,
  renderExport,
  sanitizeFileName,
  toCsv,
  toJson,
  toMarkdown,
} from "@/lib/export/exportAnalysis";

// ---------------------------------------------------------------- 素材

function fundamentals(): Fundamentals {
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
      { title: "株価・規模", metrics: [{ label: "時価総額", value: "3.50兆 USD", raw: 3.5e12 }] },
      {
        title: "バリュエーション",
        metrics: [
          { label: "PER（実績）", value: "31.20", raw: 31.2 },
          { label: "EV / 売上高", value: "8.00", raw: 8 },
        ],
      },
      { title: "成長性", metrics: [{ label: "売上成長率（YoY）", value: "6.10%", raw: 6.1 }] },
      {
        title: "収益性",
        metrics: [
          { label: "粗利率", value: "46.20%", raw: 46.2 },
          { label: "ROE", value: "150.00%", raw: 150 },
        ],
      },
      {
        title: "キャッシュ",
        metrics: [
          { label: "営業CF", value: "-60.00億", raw: -6e9 },
          { label: "現金・同等物", value: "120.00億", raw: 1.2e10 },
          { label: "負債比率 (D/E)", value: "150.00", raw: 150 },
        ],
      },
    ],
  };
}

function markdown(score = 4): string {
  const rows = CRITERIA.map((c) => `| ${c.id} | ${c.label} | ${score} | 良好 | 根拠 |`).join("\n");
  return `## 評価テーブル

| # | 項目 | スコア | 評価 | 根拠 |
| --- | --- | --- | --- | --- |
${rows}

## 強み

- ブランド力が強い, 価格決定力もある
- サービス比率の上昇
- 潤沢なキャッシュ
- 自社株買いの継続
- サプライチェーンの統制
- 六つ目（切り捨てられる）

## リスク

- 中国依存
- 規制当局の動き
- ハードの成長鈍化

## バリュエーション所見

割高圏。

## 総合投資判断

中立。`;
}

function record(over: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    ...buildAnalysisRecord({
      ticker: "AAPL",
      raw: markdown(),
      fundamentals: fundamentals(),
      quarterly: null,
      provider: "anthropic",
      model: "claude-opus-5",
      savedAtMs: Date.UTC(2026, 7, 2, 3, 0, 0),
    }),
    ...over,
  };
}

// ---------------------------------------------------------------- 決算期

describe("fiscalQuarterOf", () => {
  it("`FY2026 Q3` を `FY26-Q3` にそろえる", () => {
    expect(fiscalQuarterOf("FY2026 Q3", 0)).toBe("FY26-Q3");
  });

  it("`2026Q3` のような表記も拾う", () => {
    expect(fiscalQuarterOf("2026Q3", 0)).toBe("FY26-Q3");
    expect(fiscalQuarterOf("2026-Q1", 0)).toBe("FY26-Q1");
  });

  it("取れなければ保存日時から組み立てる", () => {
    expect(fiscalQuarterOf(null, new Date(2026, 7, 2).getTime())).toBe("FY26-Q3");
    expect(fiscalQuarterOf("", new Date(2026, 0, 5).getTime())).toBe("FY26-Q1");
  });
});

describe("statusOf / toHundred", () => {
  it("平均から 🟢🟡🔴 を決める", () => {
    expect(statusOf(4.2).statusIcon).toBe("🟢");
    expect(statusOf(3.5).statusIcon).toBe("🟡");
    expect(statusOf(2.1).statusIcon).toBe("🔴");
  });

  it("判定不能は 🔴 として扱うが、ラベルで区別できる", () => {
    expect(statusOf(null).statusLabel).toBe("判定不能");
  });

  it("100 点満点へ換算する", () => {
    expect(toHundred(4)).toBe(80);
    expect(toHundred(5)).toBe(100);
    expect(toHundred(null)).toBeNull();
  });
});

// ---------------------------------------------------------------- レコード

describe("buildAnalysisRecord", () => {
  it("指定された構造がそろう", () => {
    const r = record();
    expect(r.version).toBe(1);
    expect(r.ticker).toBe("AAPL");
    expect(r.fiscalQuarter).toMatch(/^FY\d{2}-Q[1-4]$/);
    expect(r.summary.totalScore).toBe(80);
    expect(r.summary.statusIcon).toBe("🟢");
    expect(r.blockScores).toHaveLength(5);
    expect(r.rawMarkdownOutput).toContain("## 評価テーブル");
  });

  it("5 ブロックのスコアが入る", () => {
    const labels = record().blockScores.map((b) => b.label);
    expect(labels).toEqual([
      "成長性",
      "財務生存性",
      "経済性",
      "競争優位性",
      "バリュエーション",
    ]);
  });

  it("主要数値に指定の項目が含まれる", () => {
    const keys = record().keyMetrics.map((m) => m.key);
    for (const key of [
      "revenueGrowth",
      "cashRunway",
      "grossMargin",
      "dilution",
      "evGrossProfit",
      "per",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("Cash Runway と EV/粗利が導出される", () => {
    const metrics = new Map(record().keyMetrics.map((m) => [m.key, m.value]));
    expect(metrics.get("cashRunway")).toBe("24.0 か月");
    expect(metrics.get("evGrossProfit")).toBe("17.3 倍");
  });

  it("**強み・リスクは 5 点まで**（多すぎると比較に使えない）", () => {
    const r = record();
    expect(r.evaluations.strengths).toHaveLength(5);
    expect(r.evaluations.risks).toHaveLength(3);
  });

  it("スコア 0（判定不能）は平均から除く", () => {
    const r = buildAnalysisRecord({
      ticker: "AAPL",
      raw: markdown(0),
      fundamentals: null,
      quarterly: null,
      provider: null,
      model: null,
      savedAtMs: 0,
    });
    expect(r.summary.averageScore).toBeNull();
    expect(r.summary.scoredCount).toBe(0);
    expect(r.summary.statusLabel).toBe("判定不能");
  });

  it("市場データが無くても組み立てられる", () => {
    const r = buildAnalysisRecord({
      ticker: "nvda",
      raw: markdown(),
      fundamentals: null,
      quarterly: null,
      provider: null,
      model: null,
      savedAtMs: 0,
    });
    expect(r.ticker).toBe("NVDA");
    expect(r.keyMetrics.every((m) => typeof m.value === "string")).toBe(true);
  });
});

describe("シリアライズ / デシリアライズ", () => {
  it("JSON にして読み戻すと同じ内容になる", () => {
    const original = record();
    const restored = parseAnalysisRecord(serializeAnalysisRecord(original));
    expect(restored).toEqual(original);
  });

  it("**壊れた JSON でも例外を投げない**（1 件の破損で一覧が消えない）", () => {
    expect(parseAnalysisRecord("{ broken")).toBeNull();
    expect(parseAnalysisRecord("null")).toBeNull();
    expect(parseAnalysisRecord("[]")).toBeNull();
  });

  it("必須項目が欠けていたら読み込まない", () => {
    expect(parseAnalysisRecord(JSON.stringify({ ticker: "" }))).toBeNull();
    expect(parseAnalysisRecord(JSON.stringify({ ticker: "AAPL" }))).toBeNull();
  });

  it("欠けている任意項目は既定で埋める（古い保存も読める）", () => {
    const restored = parseAnalysisRecord(
      JSON.stringify({ ticker: "AAPL", rawMarkdownOutput: "本文" }),
    );
    expect(restored?.blockScores).toEqual([]);
    expect(restored?.evaluations.strengths).toEqual([]);
    expect(restored?.summary.totalScore).toBeNull();
  });
});

// ---------------------------------------------------------------- CSV

describe("CSV 出力", () => {
  it("カンマ・改行・引用符を含むセルを壊さない", () => {
    expect(escapeCsv("普通")).toBe("普通");
    expect(escapeCsv("a,b")).toBe('"a,b"');
    expect(escapeCsv('言った"そう"')).toBe('"言った""そう"""');
    expect(escapeCsv("1行目\n2行目")).toBe('"1行目\n2行目"');
  });

  it("行を組み立てられる", () => {
    expect(csvRow(["a", "b,c"])).toBe('a,"b,c"');
  });

  it("ヘッダーと 1 行が出る", () => {
    const csv = toCsv([record()]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toContain("ティッカー");
    expect(lines[0]).toContain("総合スコア(100点)");
    expect(csv).toContain("AAPL");
    expect(csv).toContain("Apple Inc.");
  });

  it("読点を含む分析文が列をずらさない", () => {
    const csv = toCsv([record()]);
    // 「ブランド力が強い, 価格決定力もある」は引用符で包まれる
    expect(csv).toContain('"ブランド力が強い, 価格決定力もある"');
  });

  it("Excel 向けに BOM を先頭に付ける", () => {
    expect(toCsv([record()]).charCodeAt(0)).toBe(0xfeff);
  });

  it("**列は全レコードの和集合で作る**（銘柄ごとに指標が違っても落とさない）", () => {
    const withExtra = record({
      ticker: "NVDA",
      keyMetrics: [{ key: "special", label: "特別指標", value: "42", raw: 42 }],
    });
    const csv = toCsv([record(), withExtra]);
    expect(csv).toContain("特別指標");
    expect(csv).toContain("42");
  });

  it("レコードが無ければ空文字", () => {
    expect(toCsv([])).toBe("");
  });
});

// ---------------------------------------------------------------- Markdown

describe("Markdown 出力", () => {
  const md = toMarkdown([record()]);

  it("見出しと総合スコアが入る", () => {
    expect(md).toContain("# AAPL — Apple Inc.");
    expect(md).toContain("80 / 100");
    expect(md).toContain("🟢");
  });

  it("ブロック別スコアと主要指標の表が入る", () => {
    expect(md).toContain("## ブロック別スコア");
    expect(md).toContain("| 成長性 |");
    expect(md).toContain("## 主要指標");
    expect(md).toContain("Cash Runway");
  });

  it("強み・リスクと生成テキスト全文が入る", () => {
    expect(md).toContain("## 適合・強み");
    expect(md).toContain("## 基準未達・リスク");
    expect(md).toContain("## 生成テキスト（全文）");
    expect(md).toContain("## 評価テーブル");
  });

  it("**免責が必ず付く**（配布される可能性があるため）", () => {
    expect(md).toContain("投資助言ではありません");
    expect(md).toContain("自己責任");
  });

  it("複数銘柄は区切り線でつなぐ", () => {
    const two = toMarkdown([record(), record({ ticker: "NVDA" })]);
    expect(two.split("\n---\n\n").length).toBeGreaterThan(1);
  });

  it("強み・リスクが空でも表を崩さない", () => {
    const empty = toMarkdown([record({ evaluations: { strengths: [], risks: [] } })]);
    expect(empty).toContain("（該当なし）");
  });
});

// ---------------------------------------------------------------- JSON

describe("JSON 出力", () => {
  it("スキーマ名と件数を含む", () => {
    const parsed = JSON.parse(toJson([record()]));
    expect(parsed.schema).toBe("stoq-analysis/v1");
    expect(parsed.count).toBe(1);
    expect(parsed.records[0].ticker).toBe("AAPL");
  });

  it("読み戻してレコードとして使える", () => {
    const parsed = JSON.parse(toJson([record()]));
    const restored = parseAnalysisRecord(JSON.stringify(parsed.records[0]));
    expect(restored?.summary.totalScore).toBe(80);
  });

  it("空でも壊れた JSON にならない", () => {
    expect(() => JSON.parse(toJson([]))).not.toThrow();
  });
});

// ---------------------------------------------------------------- 共通

describe("renderExport / ファイル名", () => {
  it("形式ごとに本文を出し分ける", () => {
    expect(renderExport([record()], "csv")).toContain("ティッカー");
    expect(renderExport([record()], "md")).toContain("# AAPL");
    expect(renderExport([record()], "json")).toContain("stoq-analysis/v1");
  });

  it("1 銘柄なら銘柄名と決算期が入る", () => {
    const name = exportFileName([record()], "csv", new Date(2026, 7, 2).getTime());
    expect(name).toBe("AAPL_FY26-Q3_20260802.csv");
  });

  it("複数銘柄なら件数が分かる名前にする", () => {
    const name = exportFileName(
      [record(), record({ ticker: "NVDA" })],
      "json",
      new Date(2026, 7, 2).getTime(),
    );
    expect(name).toContain("2銘柄");
    expect(name.endsWith(".json")).toBe(true);
  });

  it("空でも名前を作れる", () => {
    expect(exportFileName([], "md", 0)).toContain("stoq-analysis");
  });

  it("**OS が受け付けない文字を落とす**", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
    expect(sanitizeFileName("空白 入り")).toBe("空白_入り");
  });
});
