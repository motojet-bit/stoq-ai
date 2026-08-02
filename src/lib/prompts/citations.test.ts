import { describe, expect, it } from "vitest";
import {
  extractCitations,
  summarizeCitations,
  uniqueCitations,
} from "@/lib/prompts/citations";

describe("参照の抽出", () => {
  it("ページ番号と原文引用を取り出す", () => {
    const [c] = extractCitations(
      '売上は伸びている【参照: p.12 "revenue increased 18% year over year"】。',
    );
    expect(c.page).toBe(12);
    expect(c.quote).toBe("revenue increased 18% year over year");
    expect(c.source).toBe("pdf");
  });

  it("**ページが分からない `p.?` も取りこぼさない**（書かせないより書かせる）", () => {
    const [c] = extractCitations('【参照: p.? "営業利益は前年同期比 12% 増"】');
    expect(c.page).toBeNull();
    expect(c.quote).toBe("営業利益は前年同期比 12% 増");
    expect(c.source).toBe("pdf");
  });

  it("出所だけの参照（財務指標・SEC・一般知識）も拾う", () => {
    const found = extractCitations(
      "【参照: 財務指標】と【参照: SEC 10-Q】と【参照: 一般知識】",
    );
    expect(found.map((c) => c.source)).toEqual(["財務指標", "SEC 10-Q", "一般知識"]);
    expect(found.every((c) => c.page === null && c.quote === "")).toBe(true);
  });

  it("全角の引用符でも中身を取り出せる（日本語資料は全角で返ることがある）", () => {
    expect(extractCitations("【参照: p.3 「増収増益」】")[0].quote).toBe("増収増益");
    expect(extractCitations("【参照: p.3 “solid growth”】")[0].quote).toBe("solid growth");
  });

  it("出現順を保つ", () => {
    const found = extractCitations('【参照: p.1 "a"】途中【参照: p.9 "b"】');
    expect(found.map((c) => c.page)).toEqual([1, 9]);
  });

  it("参照が無ければ空", () => {
    expect(extractCitations("参照のない本文")).toEqual([]);
    expect(extractCitations("")).toEqual([]);
  });

  it("閉じていない【参照: は拾わない（壊れた出力で誤検出しない）", () => {
    expect(extractCitations("【参照: p.1 引用が閉じていない")).toEqual([]);
  });
});

describe("重複の畳み込み", () => {
  it("**同じ一文を複数項目の根拠にしても 1 件に畳む**（一覧が読めなくなる）", () => {
    const found = extractCitations('【参照: p.5 "same"】【参照: p.5 "same"】【参照: p.6 "other"】');
    expect(uniqueCitations(found)).toHaveLength(2);
  });

  it("ページが違えば別件として残す", () => {
    const found = extractCitations('【参照: p.5 "same"】【参照: p.7 "same"】');
    expect(uniqueCitations(found)).toHaveLength(2);
  });
});

describe("参照の要約", () => {
  it("資料からの引用と、ページ・引用の欠けを数える", () => {
    const found = extractCitations(
      '【参照: p.1 "ok"】【参照: p.? "no page"】【参照: p.4 】【参照: 財務指標】',
    );
    expect(summarizeCitations(found)).toEqual({
      total: 4,
      fromDocuments: 3,
      missingPage: 1,
      missingQuote: 1,
    });
  });

  it("参照ゼロでも数え上げが壊れない", () => {
    expect(summarizeCitations([])).toEqual({
      total: 0,
      fromDocuments: 0,
      missingPage: 0,
      missingQuote: 0,
    });
  });
});
