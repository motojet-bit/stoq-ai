import { describe, expect, it } from "vitest";
import {
  detectFiscalPeriod,
  matchQuarter,
  periodKey,
} from "@/lib/parser/fiscalPeriod";

describe("決算期の自動特定", () => {
  it("FY2023 Q3 形式", () => {
    const p = detectFiscalPeriod("Acme Inc. FY2023 Q3 Earnings Presentation");
    expect(p).toMatchObject({ fiscalYear: 2023, quarter: 3, key: "FY2023-Q3" });
  });

  it("Q3 FY23 形式（年が 2 桁でも 2000 年代として読む）", () => {
    expect(detectFiscalPeriod("Q3 FY23 results")).toMatchObject({
      fiscalYear: 2023,
      quarter: 3,
    });
  });

  it("日本語の「2023年12月期 第3四半期」", () => {
    expect(detectFiscalPeriod("2023年12月期 第3四半期 決算短信")).toMatchObject({
      fiscalYear: 2023,
      quarter: 3,
      key: "FY2023-Q3",
    });
  });

  it("**全角数字の「第３四半期」も読む**（日本語資料でよくある）", () => {
    expect(detectFiscalPeriod("2024年3月期第２四半期")).toMatchObject({
      fiscalYear: 2024,
      quarter: 2,
    });
  });

  it("英語の綴り（third quarter of fiscal 2023）", () => {
    expect(detectFiscalPeriod("Results for the third quarter of fiscal 2023")).toMatchObject({
      fiscalYear: 2023,
      quarter: 3,
    });
  });

  it("通期の資料は quarter が null", () => {
    expect(detectFiscalPeriod("2023年12月期 決算説明資料")).toMatchObject({
      fiscalYear: 2023,
      quarter: null,
      key: "FY2023",
    });
  });

  it("**四半期まで分かる書き方を優先する**（年度だけの記載に負けない）", () => {
    // FY2023 が先に出ていても、四半期付きの記載を採る
    const p = detectFiscalPeriod("FY2023 Annual Overview — FY2023 Q2 highlights");
    expect(p?.quarter).toBe(2);
  });

  it("**本文中の前年同期に引っ張られない**（先頭寄りだけを見る）", () => {
    const text =
      "2024年3月期 第1四半期 決算\n" +
      "x".repeat(5000) +
      "前年同期である2023年3月期 第1四半期と比較すると";
    expect(detectFiscalPeriod(text)?.fiscalYear).toBe(2024);
  });

  it("判別できなければ null（推測で埋めない）", () => {
    expect(detectFiscalPeriod("売上が伸びました")).toBeNull();
    expect(detectFiscalPeriod("")).toBeNull();
  });

  it("非現実的な年は捨てる（ページ番号や型番の誤検出を防ぐ）", () => {
    expect(detectFiscalPeriod("FY9999 Q1")).toBeNull();
  });

  it("キーの組み立て", () => {
    expect(periodKey(2023, 3)).toBe("FY2023-Q3");
    expect(periodKey(2023, null)).toBe("FY2023");
  });
});

describe("Yahoo Finance の四半期との突き合わせ", () => {
  const quarters = [
    { label: "3Q2023", endDate: "2023-09-30" },
    { label: "2Q2023", endDate: "2023-06-30" },
    { label: "1Q2023", endDate: "2023-03-31" },
  ];

  it("ラベルで当てる", () => {
    const p = detectFiscalPeriod("FY2023 Q3")!;
    expect(matchQuarter(p, quarters)?.label).toBe("3Q2023");
  });

  it("**ラベルの書式が違っても期末日で当てる**（取得元で書き方が揺れる）", () => {
    const p = detectFiscalPeriod("FY2023 Q2")!;
    const odd = [{ label: "不明", endDate: "2023-06-30" }];
    expect(matchQuarter(p, odd)?.endDate).toBe("2023-06-30");
  });

  it("**該当する期が無ければ null**（エラーにせず PDF 単体で続ける）", () => {
    const p = detectFiscalPeriod("FY2019 Q1")!;
    expect(matchQuarter(p, quarters)).toBeNull();
  });

  it("四半期が特定できていない通期資料は突き合わせない", () => {
    const p = detectFiscalPeriod("2023年12月期")!;
    expect(p.quarter).toBeNull();
    expect(matchQuarter(p, quarters)).toBeNull();
  });

  it("系列が空でも落ちない", () => {
    const p = detectFiscalPeriod("FY2023 Q3")!;
    expect(matchQuarter(p, [])).toBeNull();
  });
});
