import { beforeEach, describe, expect, it } from "vitest";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from "@/lib/ui/fontStore";

/**
 * フォントサイズの範囲。
 * 10〜20px の外に出ると、ボタンが潰れたりレイアウトが破綻する。
 */
describe("clampFontSize", () => {
  it("範囲内はそのまま", () => {
    for (let px = MIN_FONT_SIZE; px <= MAX_FONT_SIZE; px++) {
      expect(clampFontSize(px)).toBe(px);
    }
  });

  it("下限・上限を超えたら丸める", () => {
    expect(clampFontSize(0)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(9)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(-100)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(21)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(9999)).toBe(MAX_FONT_SIZE);
  });

  it("小数は四捨五入する", () => {
    expect(clampFontSize(13.4)).toBe(13);
    expect(clampFontSize(13.6)).toBe(14);
  });

  it("NaN / Infinity は既定値にフォールバックする", () => {
    expect(clampFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_FONT_SIZE);
    expect(clampFontSize(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_FONT_SIZE);
  });
});

describe("fontStore の保存と適用", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--fs-base");
  });

  it("setFontSize が :root と localStorage の両方を更新する", async () => {
    const mod = await import("@/lib/ui/fontStore");
    mod.setFontSize(17);

    expect(document.documentElement.style.getPropertyValue("--fs-base")).toBe("17px");
    expect(localStorage.getItem("stockanalyzer.fontSize")).toBe("17");
    expect(mod.getFontSize()).toBe(17);
  });

  it("範囲外を渡しても丸めた値が保存される", async () => {
    const mod = await import("@/lib/ui/fontStore");
    mod.setFontSize(100);
    expect(mod.getFontSize()).toBe(MAX_FONT_SIZE);
    expect(document.documentElement.style.getPropertyValue("--fs-base")).toBe(
      `${MAX_FONT_SIZE}px`,
    );
  });

  it("端では canStepFontSize が false を返す", async () => {
    const mod = await import("@/lib/ui/fontStore");

    mod.setFontSize(MIN_FONT_SIZE);
    expect(mod.canStepFontSize(-1)).toBe(false);
    expect(mod.canStepFontSize(1)).toBe(true);

    mod.setFontSize(MAX_FONT_SIZE);
    expect(mod.canStepFontSize(1)).toBe(false);
    expect(mod.canStepFontSize(-1)).toBe(true);
  });

  it("stepFontSize は端を超えない", async () => {
    const mod = await import("@/lib/ui/fontStore");
    mod.setFontSize(MAX_FONT_SIZE);
    expect(mod.stepFontSize(1)).toBe(MAX_FONT_SIZE);
    mod.setFontSize(MIN_FONT_SIZE);
    expect(mod.stepFontSize(-1)).toBe(MIN_FONT_SIZE);
  });
});
