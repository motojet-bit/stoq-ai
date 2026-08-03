import { describe, expect, it } from "vitest";
import {
  formatPercent,
  isMarketOpen,
  rangePosition,
  toneArrow,
  toneClass,
  toneOf,
} from "@/lib/market/quoteTone";

describe("上げ下げの向き", () => {
  it("プラスは up、マイナスは down", () => {
    expect(toneOf(1.2)).toBe("up");
    expect(toneOf(-1.2)).toBe("down");
  });

  it("変わらなければ flat", () => {
    expect(toneOf(0)).toBe("flat");
  });

  /** **取れていない値を緑にも赤にもしない。** 動いていないのに動いたように見える */
  it("値が無ければ flat", () => {
    expect(toneOf(null)).toBe("flat");
    expect(toneOf(undefined)).toBe("flat");
    expect(toneOf(Number.NaN)).toBe("flat");
    expect(toneOf(Number.POSITIVE_INFINITY)).toBe("flat");
  });

  it("色と記号が向きごとに違う", () => {
    expect(toneClass("up")).not.toBe(toneClass("down"));
    expect(toneArrow("up")).not.toBe(toneArrow("down"));
  });
});

describe("前日比の表示", () => {
  it("符号を必ず付ける", () => {
    expect(formatPercent(1.234)).toBe("+1.23%");
    expect(formatPercent(-1.235)).toBe("-1.24%");
  });

  it("変わらなければ ± を付ける", () => {
    expect(formatPercent(0)).toBe("±0.00%");
  });

  /** 取れなかったことを 0.00% と書くと「動かなかった」と誤読される */
  it("取れていなければダッシュ", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("52週レンジの位置", () => {
  it("安値で 0、高値で 1、中間で 0.5", () => {
    expect(rangePosition(100, 100, 200)).toBe(0);
    expect(rangePosition(200, 100, 200)).toBe(1);
    expect(rangePosition(150, 100, 200)).toBe(0.5);
  });

  it("レンジ外でも 0〜1 に収める", () => {
    expect(rangePosition(250, 100, 200)).toBe(1);
    expect(rangePosition(50, 100, 200)).toBe(0);
  });

  it("高値と安値が同じなら出さない", () => {
    expect(rangePosition(100, 100, 100)).toBeNull();
  });

  it("欠けている値があれば出さない", () => {
    expect(rangePosition(null, 100, 200)).toBeNull();
    expect(rangePosition(150, null, 200)).toBeNull();
    expect(rangePosition(150, 100, null)).toBeNull();
  });
});

describe("市場の状態", () => {
  it("REGULAR のときだけ開いている", () => {
    expect(isMarketOpen("REGULAR")).toBe(true);
    expect(isMarketOpen("regular")).toBe(true);
    expect(isMarketOpen("CLOSED")).toBe(false);
    expect(isMarketOpen("PRE")).toBe(false);
  });

  it("分からなければ開いている扱いにしない", () => {
    expect(isMarketOpen(null)).toBe(false);
    expect(isMarketOpen(undefined)).toBe(false);
  });
});
