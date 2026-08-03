import { describe, expect, it } from "vitest";
import {
  detectFiscalPeriod,
  collectFiscalPeriods,
  detectFiscalPeriodFromName,
  likelyLatestPeriod,
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

describe("ファイル名からの読み取り", () => {
  it("**本文が読めないときの手がかりにする**（FY26_Q3.pdf のような命名）", () => {
    const p = detectFiscalPeriodFromName("FY26_Q3.pdf");
    expect(p).toMatchObject({ fiscalYear: 2026, quarter: 3, matchedBy: "fileName" });
  });

  it("区切りが混ざっていても読む", () => {
    expect(detectFiscalPeriodFromName("ACME-2024年3月期_第2四半期-決算.pdf")).toMatchObject({
      fiscalYear: 2024,
      quarter: 2,
    });
  });

  it("拡張子が無くても読む", () => {
    expect(detectFiscalPeriodFromName("FY2023 Q1")?.quarter).toBe(1);
  });

  it("期らしきものが無ければ null（推測で埋めない）", () => {
    expect(detectFiscalPeriodFromName("決算資料.pdf")).toBeNull();
    expect(detectFiscalPeriodFromName("")).toBeNull();
  });
});

describe("複数資料の期のまとめ", () => {
  it("**期の種類ごとにまとめる**（混ぜて分析させないため）", () => {
    const groups = collectFiscalPeriods([
      { name: "a.pdf", text: "FY2024 Q2 presentation" },
      { name: "b.pdf", text: "FY2024 Q3 presentation" },
      { name: "c.pdf", text: "FY2024 Q3 supplement" },
    ]);
    expect(groups).toHaveLength(2);
    // 新しい期が先
    expect(groups[0].period.key).toBe("FY2024-Q3");
    expect(groups[0].documents).toEqual(["b.pdf", "c.pdf"]);
  });

  it("ファイル名でも拾う（本文が読めない資料）", () => {
    const groups = collectFiscalPeriods([{ name: "FY26_Q1.pdf", text: "" }]);
    expect(groups[0].period.key).toBe("FY2026-Q1");
  });

  it("期が読めない資料は束ねない（不明を 1 つの期として扱わない）", () => {
    expect(collectFiscalPeriods([{ name: "memo.txt", text: "売上が伸びた" }])).toEqual([]);
  });

  it("全部同じ期なら 1 グループ（絞り込みは不要）", () => {
    const groups = collectFiscalPeriods([
      { name: "a.pdf", text: "FY2024 Q2" },
      { name: "b.pdf", text: "FY2024 Q2" },
    ]);
    expect(groups).toHaveLength(1);
  });
});

describe("提出されていそうな最新期の見積もり", () => {
  it("**1 四半期前を出す**（四半期報告は期末から 40〜45 日遅れる）", () => {
    // 8 月 → Q2（4〜6 月期）
    expect(likelyLatestPeriod(new Date(2026, 7, 15))).toMatchObject({
      fiscalYear: 2026,
      quarter: 2,
    });
  });

  it("年初は前年の Q4 へ戻す", () => {
    expect(likelyLatestPeriod(new Date(2026, 0, 20))).toMatchObject({
      fiscalYear: 2025,
      quarter: 4,
    });
  });

  it("見積もりであることが分かる", () => {
    expect(likelyLatestPeriod(new Date(2026, 7, 1)).matchedBy).toBe("estimated");
  });
});
