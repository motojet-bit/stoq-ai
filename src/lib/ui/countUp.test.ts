import { describe, expect, it } from "vitest";
import { COUNT_UP_MS, countUpValue, easeOut, isCountUpDone } from "@/lib/ui/countUp";

describe("減速カーブ", () => {
  it("0 から 1 へ進む", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  it("**終盤で減速する**（等速だと確定した感じが出ない）", () => {
    // 前半の伸びが後半より大きい
    expect(easeOut(0.5) - easeOut(0)).toBeGreaterThan(easeOut(1) - easeOut(0.5));
  });

  it("範囲外は丸める（負の経過時間やオーバーランで暴れない）", () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(5)).toBe(1);
  });
});

describe("表示する値", () => {
  it("開始時は 0", () => {
    expect(countUpValue(4.1, 0)).toBe(0);
  });

  it("終了時は目標値ちょうど", () => {
    expect(countUpValue(4.1, COUNT_UP_MS)).toBe(4.1);
  });

  it("**小数第 1 位まで**（スコアは 4.1 / 5 の形で出す）", () => {
    const v = countUpValue(4.1, COUNT_UP_MS / 2);
    expect(v).toBe(Math.round(v * 10) / 10);
  });

  it("目標を超えない", () => {
    expect(countUpValue(4.1, COUNT_UP_MS * 3)).toBeLessThanOrEqual(4.1);
  });

  it("単調に増える", () => {
    let prev = -1;
    for (let ms = 0; ms <= COUNT_UP_MS; ms += 100) {
      const v = countUpValue(5, ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("長さ 0 なら即確定（演出を切りたいとき）", () => {
    expect(countUpValue(3.3, 0, 0)).toBe(3.3);
  });
});

describe("終了判定", () => {
  it("経過が長さに達したら終わり", () => {
    expect(isCountUpDone(COUNT_UP_MS)).toBe(true);
    expect(isCountUpDone(COUNT_UP_MS - 1)).toBe(false);
  });
});
