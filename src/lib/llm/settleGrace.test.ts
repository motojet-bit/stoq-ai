import { describe, expect, it } from "vitest";
import { SETTLE_GRACE_MS, waitForSettle } from "@/lib/llm/settleGrace";

/** 指定ミリ秒後に解決する Promise。応答の遅れを模す。 */
const delayed = <T,>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("waitForSettle", () => {
  it("猶予の中で届けば settled", async () => {
    expect(await waitForSettle(delayed("done", 20), 200)).toBe("settled");
  });

  it("猶予を過ぎても届かなければ pending", async () => {
    expect(await waitForSettle(delayed("done", 200), 20)).toBe("pending");
  });

  it("失敗も決着として扱う（未処理の拒否にしない）", async () => {
    const failing = Promise.reject(new Error("boom"));
    expect(await waitForSettle(failing, 200)).toBe("settled");
    // 元の Promise 側でも受けておく
    await failing.catch(() => undefined);
  });

  it("遅い応答を失敗と決めつけない猶予がある", () => {
    // IPC 1 往復に足りない値にすると、成功した分析を捨てることになる
    expect(SETTLE_GRACE_MS).toBeGreaterThanOrEqual(1000);
  });
});
