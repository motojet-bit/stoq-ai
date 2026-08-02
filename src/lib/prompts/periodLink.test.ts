import { describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n/i18n";
import { buildPeriodSection, linkFiscalPeriod } from "@/lib/prompts/periodLink";
import type { Quarter, QuarterlySeries } from "@/types";

// 文面を日本語で確かめる。モジュール読み込み時に定数が組み上がるので**トップレベル**で切り替える
setLocale("ja");

const quarter = (label: string, endDate: string): Quarter => ({
  label,
  endDate,
  revenue: 1000,
  revenueDisplay: "1,000",
  netIncome: 100,
  netIncomeDisplay: "100",
  netMargin: 10,
  revenueQoq: 2.5,
  revenueYoy: 18.4,
  epsActual: 1.23,
  epsEstimate: 1.1,
  epsSurprisePct: 11.8,
});

const series = (quarters: Quarter[]): QuarterlySeries => ({
  ticker: "ACME",
  currency: "USD",
  quarters,
  momentum: {
    summary: "",
    latestYoy: null,
    previousYoy: null,
    accelerating: false,
    marginImproving: false,
  },
  source: "test",
  note: null,
  fetchedAtMs: 0,
});

describe("決算期と当時データの結びつけ", () => {
  it("資料の決算期を読み取り、当時の四半期に当てる", () => {
    const link = linkFiscalPeriod(
      [{ name: "決算説明資料.pdf", text: "Acme FY2023 Q3 Earnings" }],
      series([quarter("3Q2023", "2023-09-30")]),
    );
    expect(link?.period.key).toBe("FY2023-Q3");
    expect(link?.documentName).toBe("決算説明資料.pdf");
    expect(link?.matched?.label).toBe("3Q2023");
  });

  it("**当時のデータが無くても link 自体は返す**（PDF 単体で分析を続ける）", () => {
    const link = linkFiscalPeriod(
      [{ name: "old.pdf", text: "FY2015 Q1 results" }],
      series([quarter("3Q2023", "2023-09-30")]),
    );
    expect(link?.period.key).toBe("FY2015-Q1");
    expect(link?.matched).toBeNull();
  });

  it("四半期データそのものが無くても落ちない", () => {
    const link = linkFiscalPeriod([{ name: "a.pdf", text: "FY2023 Q3" }], null);
    expect(link?.matched).toBeNull();
  });

  it("決算期を読み取れる資料が無ければ null", () => {
    expect(linkFiscalPeriod([{ name: "memo.txt", text: "売上が伸びた" }], null)).toBeNull();
    expect(linkFiscalPeriod([], null)).toBeNull();
  });

  it("**最初に読み取れた資料を主資料にする**（複数入っても期がぶれない）", () => {
    const link = linkFiscalPeriod(
      [
        { name: "main.pdf", text: "FY2024 Q1 presentation" },
        { name: "sub.pdf", text: "FY2023 Q4 presentation" },
      ],
      null,
    );
    expect(link?.documentName).toBe("main.pdf");
    expect(link?.period.key).toBe("FY2024-Q1");
  });
});

describe("プロンプトに載せる決算期セクション", () => {
  it("突き合わせできたら当時の値を表で載せ、照合を指示する", () => {
    const link = linkFiscalPeriod(
      [{ name: "q3.pdf", text: "FY2023 Q3" }],
      series([quarter("3Q2023", "2023-09-30")]),
    );
    const section = buildPeriodSection(link);
    expect(section).toContain("FY2023-Q3");
    expect(section).toContain("3Q2023");
    expect(section).toContain("+18.4%");
    expect(section).toContain("食い違いがあれば必ず指摘");
  });

  it("**取得できなかったことを明記する**（黙って省くと当時の株価があるものとして書かれる）", () => {
    const link = linkFiscalPeriod([{ name: "old.pdf", text: "FY2015 Q1" }], null);
    const section = buildPeriodSection(link);
    expect(section).toContain("当時の四半期データは取得できなかった");
    expect(section).toContain("推測で補わないこと");
  });

  it("決算期を読み取れなければセクションごと出さない", () => {
    expect(buildPeriodSection(null)).toBe("");
  });
});
