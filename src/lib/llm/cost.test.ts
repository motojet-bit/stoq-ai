import { describe, expect, it } from "vitest";
import {
  DEFAULT_USD_JPY,
  estimateCost,
  formatJpy,
  formatTokens,
  formatUsd,
  rateFor,
} from "@/lib/llm/cost";

describe("単価の引き当て", () => {
  it("**日付付きのモデル名でも当たる**（部分一致で引く）", () => {
    expect(rateFor("gpt-4o-2024-08-06")).toEqual({ input: 2.5, output: 10 });
    expect(rateFor("claude-opus-5-20260101")).toEqual({ input: 5, output: 25 });
  });

  it("**具体的な名前を先に見る**（gpt-4o-mini が gpt-4o に食われない）", () => {
    expect(rateFor("gpt-4o-mini")).toEqual({ input: 0.15, output: 0.6 });
  });

  it("大文字小文字を問わない", () => {
    expect(rateFor("GPT-4O")).toEqual(rateFor("gpt-4o"));
  });

  it("**知らないモデルは null**（適当な単価で桁違いの金額を出さない）", () => {
    expect(rateFor("mystery-model-9000")).toBeNull();
    expect(rateFor(null)).toBeNull();
  });
});

describe("コスト概算", () => {
  it("入力と出力を別単価で足す", () => {
    const c = estimateCost({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: "claude-opus-5",
    });
    expect(c.usd).toBeCloseTo(30, 6);
    expect(c.jpy).toBeCloseTo(30 * DEFAULT_USD_JPY, 4);
  });

  it("為替は差し替えられる", () => {
    const c = estimateCost({
      inputTokens: 1_000_000,
      outputTokens: 0,
      model: "claude-opus-5",
      usdJpy: 100,
    });
    expect(c.jpy).toBeCloseTo(500, 6);
  });

  it("知らないモデルなら 0 とフラグを返す（概算できないことを伝える）", () => {
    const c = estimateCost({ inputTokens: 999, outputTokens: 999, model: "unknown" });
    expect(c).toEqual({ usd: 0, jpy: 0, unknownModel: true });
  });

  it("トークン 0 なら 0", () => {
    expect(estimateCost({ inputTokens: 0, outputTokens: 0, model: "gpt-4o" }).usd).toBe(0);
  });
});

describe("表示の整形", () => {
  it("**小さすぎる額でも 0 と出さない**（無料だと受け取られる）", () => {
    expect(formatJpy(0.32)).toBe("¥0.32");
    expect(formatJpy(5.24)).toBe("¥5.2");
  });

  it("大きい額は桁区切りで丸める", () => {
    expect(formatJpy(1234.6)).toBe("¥1,235");
  });

  it("ちょうど 0 は 0", () => {
    expect(formatJpy(0)).toBe("¥0");
    expect(formatUsd(0)).toBe("$0");
  });

  it("ドルは小額で桁を残す", () => {
    expect(formatUsd(0.0342)).toBe("$0.034");
    expect(formatUsd(12.345)).toBe("$12.35");
  });

  it("トークン数は桁区切り", () => {
    expect(formatTokens(12400)).toBe("12,400 tkn");
    expect(formatTokens(-5)).toBe("0 tkn");
  });
});
