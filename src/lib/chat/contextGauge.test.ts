import { describe, expect, it } from "vitest";
import {
  contextLimitFor,
  contextUsage,
  DEFAULT_CONTEXT_LIMIT,
  formatCompactTokens,
  gaugeBlocks,
  levelOf,
} from "@/lib/chat/contextGauge";

describe("上限の引き当て", () => {
  it("モデル名から引く", () => {
    expect(contextLimitFor("gpt-4o")).toBe(128_000);
    expect(contextLimitFor("claude-opus-5")).toBe(1_000_000);
  });

  it("**具体的な名前を先に見る**（gpt-4o-mini が gpt-4o に食われない）", () => {
    expect(contextLimitFor("gpt-4o-mini")).toBe(128_000);
  });

  it("**知らないモデルは控えめな既定値**（多く見積もると上限に当たって気づけない）", () => {
    expect(contextLimitFor("mystery-9000")).toBe(DEFAULT_CONTEXT_LIMIT);
    expect(contextLimitFor(null)).toBe(DEFAULT_CONTEXT_LIMIT);
  });
});

describe("色の切り替え", () => {
  it("70% 未満は緑、70〜85% は黄、85% 以上は赤", () => {
    expect(levelOf(0)).toBe("ok");
    expect(levelOf(0.69)).toBe("ok");
    expect(levelOf(0.7)).toBe("warn");
    expect(levelOf(0.84)).toBe("warn");
    expect(levelOf(0.85)).toBe("danger");
    expect(levelOf(1)).toBe("danger");
  });
});

describe("使用量の見積もり", () => {
  it("会話の長さに応じて増える", () => {
    const short = contextUsage({ messages: [{ content: "あ" }], model: "gpt-4o" });
    const long = contextUsage({ messages: [{ content: "あ".repeat(1000) }], model: "gpt-4o" });
    expect(long.used).toBeGreaterThan(short.used);
  });

  it("**システムプロンプトも数える**（数えないと実際より少なく見える）", () => {
    const withSystem = contextUsage({
      messages: [{ content: "質問" }],
      systemPrompt: "あ".repeat(500),
      model: "gpt-4o",
    });
    const without = contextUsage({ messages: [{ content: "質問" }], model: "gpt-4o" });
    expect(withSystem.used).toBeGreaterThan(without.used);
  });

  it("比率は 1 を超えない（上限を越えてもバーが振り切れない）", () => {
    const usage = contextUsage({
      messages: [{ content: "あ".repeat(500_000) }],
      model: "gpt-4o",
    });
    expect(usage.ratio).toBeLessThanOrEqual(1);
    expect(usage.level).toBe("danger");
  });

  it("空の会話なら 0", () => {
    expect(contextUsage({ messages: [], model: "gpt-4o" }).used).toBe(0);
  });
});

describe("表示の整形", () => {
  it("千・百万で丸める", () => {
    expect(formatCompactTokens(950)).toBe("950");
    expect(formatCompactTokens(44_800)).toBe("44.8k");
    expect(formatCompactTokens(1_250_000)).toBe("1.3M");
  });

  it("負の値でも壊れない", () => {
    expect(formatCompactTokens(-5)).toBe("0");
  });
});

describe("ゲージの目盛り", () => {
  it("比率に応じて埋まる", () => {
    expect(gaugeBlocks(0)).toEqual({ filled: 0, total: 5 });
    expect(gaugeBlocks(0.5)).toEqual({ filled: 3, total: 5 });
    expect(gaugeBlocks(1)).toEqual({ filled: 5, total: 5 });
  });

  it("**少しでも使っていれば 1 つは点ける**（0 のままだと動いていないように見える）", () => {
    expect(gaugeBlocks(0.01).filled).toBe(1);
  });

  it("総数を超えない", () => {
    expect(gaugeBlocks(2).filled).toBe(5);
  });
});
