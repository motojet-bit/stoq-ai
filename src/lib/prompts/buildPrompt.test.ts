import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt } from "@/lib/prompts/buildPrompt";
import { condenseDocument } from "@/lib/prompts/condense";
import { estimateTokens } from "@/lib/parser/tokenCount";

const DECK = [
  "【将来見通しに関する注意事項】",
  "本資料に含まれる将来に関する記述は見通しであり、いかなる保証をするものではありません。",
  "",
  "【セグメント別業績】",
  "iPhone部門の売上高は512億ドル、前年同期比8.2%増となりました。",
  "サービス部門の売上高は287億ドル、前年同期比14.1%増と過去最高を更新しました。",
  "Mac部門は79億ドルで前年同期比3.4%減となりました。",
  "ウェアラブル部門は91億ドル、前年同期比1.2%増です。",
  "",
  "【質疑応答】",
  "Q: サービスの成長は続きますか。",
  "A: 契約者数と単価の両方が寄与しており、当面は二桁成長を見込んでいます。",
].join("\n");

describe("condenseDocument（スマート圧縮）", () => {
  it("予算内なら何も変えない", () => {
    const r = condenseDocument(DECK, 100_000, "資料");
    expect(r.text).toBe(DECK);
    expect(r.notes).toEqual([]);
  });

  it("圧縮しても数値明細（セグメント業績）は全行残る", () => {
    // 数値明細セクションは丸ごと優先確保される
    const r = condenseDocument(DECK, Math.floor(estimateTokens(DECK) * 0.7), "決算説明会");
    for (const needle of ["512億ドル", "287億ドル", "79億ドル", "91億ドル"]) {
      expect(r.text).toContain(needle);
    }
  });

  it("極端な圧縮でも、落ちた箇所には必ずマーカーが入る", () => {
    // ここまで削ると全行は残せないが、欠落が見える形になっていること
    const r = condenseDocument(DECK, Math.floor(estimateTokens(DECK) * 0.35), "決算説明会");
    expect(r.text).toContain("文を省略");
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("中間の一括カットは行わない", () => {
    const r = condenseDocument(DECK, Math.floor(estimateTokens(DECK) * 0.4), "決算説明会");
    expect(r.text).not.toContain("中略：約");
  });

  it("定型文（免責事項）を優先的に落とす", () => {
    const r = condenseDocument(DECK, Math.floor(estimateTokens(DECK) * 0.5), "決算説明会");
    expect(r.text).not.toContain("いかなる保証");
  });

  it("空文字でも落ちない", () => {
    expect(condenseDocument("", 100, "空").text).toBe("");
  });

  it("極端に小さい予算でも何かは残る", () => {
    const r = condenseDocument(DECK, 5, "決算説明会");
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe("buildAnalysisPrompt（トークン予算）", () => {
  const bigFiling =
    "Item 1. Business\n" + "A".repeat(40_000) +
    "\nItem 1A. Risk Factors\n" + "リスク要因の記述。".repeat(2_000) +
    "\nItem 7. Management's Discussion and Analysis\n" + "B".repeat(60_000);

  const build = (tokenLimit: number) =>
    buildAnalysisPrompt({
      ticker: "AAPL",
      fundamentals: null,
      quarterly: null,
      filing: {
        form: "10-Q",
        filed: "2026-07-31",
        period: "2026-06-27",
        url: "https://sec.gov/x",
        text: bigFiling,
      },
      documents: [
        { name: "決算説明会.pptx", text: DECK },
        { name: "巨大資料.txt", text: "詳細な説明。".repeat(15_000) },
      ],
      tokenLimit,
      reserveForOutput: 8_000,
    });

  it("上限を超えない", () => {
    for (const limit of [20_000, 30_000, 60_000, 180_000]) {
      const built = build(limit);
      expect(built.tokens).toBeLessThanOrEqual(limit - 8_000);
    }
  });

  it("SEC の重要な節を優先して残す", () => {
    const built = build(30_000);
    expect(built.user).toContain("Item 1A. Risk Factors");
    expect(built.user).toContain("Item 7. MD&A");
  });

  it("切り詰めたときは必ず注記を出す", () => {
    expect(build(30_000).notes.length).toBeGreaterThan(0);
  });

  it("上限が極端に小さくても例外を投げない", () => {
    const built = build(9_000);
    expect(built.system.length).toBeGreaterThan(0);
    expect(built.notes.length).toBeGreaterThan(0);
  });

  it("資料が何も無くてもプロンプトは組める", () => {
    const built = buildAnalysisPrompt({
      ticker: "NVDA",
      fundamentals: null,
      quarterly: null,
      filing: null,
      documents: [],
      tokenLimit: 180_000,
      reserveForOutput: 8_000,
    });
    expect(built.user).toContain("NVDA");
    expect(built.tokens).toBeGreaterThan(0);
  });
});
