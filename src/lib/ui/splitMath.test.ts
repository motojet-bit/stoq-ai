import { describe, expect, it } from "vitest";
import { clampSecondSize } from "@/lib/ui/splitMath";

/**
 * リサイズの境界値。
 * パネルが潰れて操作できなくなる／画面外へはみ出すことがないかを確認する。
 */
describe("clampSecondSize", () => {
  const base = { total: 1000, minFirst: 200, minSecond: 150 };

  it("通常範囲ではドラッグ位置をそのまま使う", () => {
    expect(clampSecondSize({ ...base, desired: 400 })).toBe(400);
  });

  it("2 番目の最小を下回らない", () => {
    expect(clampSecondSize({ ...base, desired: 10 })).toBe(150);
    expect(clampSecondSize({ ...base, desired: -500 })).toBe(150);
  });

  it("1 番目の最小を侵食しない", () => {
    // total 1000 - minFirst 200 = 800 が上限
    expect(clampSecondSize({ ...base, desired: 950 })).toBe(800);
    expect(clampSecondSize({ ...base, desired: 100_000 })).toBe(800);
  });

  it("ちょうど境界の値はそのまま通る", () => {
    expect(clampSecondSize({ ...base, desired: 150 })).toBe(150);
    expect(clampSecondSize({ ...base, desired: 800 })).toBe(800);
  });

  it("両方の最小を満たせないほど狭い場合は 1 番目を優先する", () => {
    // total 300, minFirst 200 → 2 番目は最大 100（minSecond 150 に届かない）
    const narrow = clampSecondSize({ total: 300, minFirst: 200, minSecond: 150, desired: 250 });
    expect(narrow).toBe(100);
    expect(narrow).toBeGreaterThanOrEqual(0);
  });

  it("コンテナが 0 でも負のサイズを返さない", () => {
    expect(clampSecondSize({ total: 0, minFirst: 200, minSecond: 150, desired: 100 })).toBe(0);
  });

  it("NaN が来ても最小サイズにフォールバックする", () => {
    expect(clampSecondSize({ ...base, desired: Number.NaN })).toBe(150);
  });
});
