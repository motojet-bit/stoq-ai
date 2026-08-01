import { describe, expect, it } from "vitest";
import { estimateTokens, formatTokens, tokenUsage } from "@/lib/parser/tokenCount";

describe("estimateTokens", () => {
  it("空文字は 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("CJK は 1 文字 1 トークン", () => {
    expect(estimateTokens("日本語のテキスト")).toBe(8);
  });

  it("英数字は 4 文字 1 トークン", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("混在でも合算できる", () => {
    // CJK 2 + 英数 4 → 2 + 1
    expect(estimateTokens("日本abcd")).toBe(3);
  });

  it("絵文字やサロゲートペアでも落ちない", () => {
    expect(estimateTokens("🚀📈")).toBeGreaterThan(0);
  });
});

describe("tokenUsage", () => {
  it("75% 未満は ok", () => {
    expect(tokenUsage(100, 1000).level).toBe("ok");
  });

  it("75% 以上 100% 未満は warning", () => {
    expect(tokenUsage(750, 1000).level).toBe("warning");
    expect(tokenUsage(999, 1000).level).toBe("warning");
  });

  it("100% 以上は over", () => {
    expect(tokenUsage(1000, 1000).level).toBe("over");
    expect(tokenUsage(5000, 1000).level).toBe("over");
  });

  it("上限 0 でも 0 除算しない", () => {
    const u = tokenUsage(10, 0);
    expect(Number.isFinite(u.ratio)).toBe(true);
    expect(u.limit).toBeGreaterThan(0);
  });
});

describe("formatTokens", () => {
  it("桁に応じて短縮する", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(2_000_000)).toBe("2.00M");
  });
});
