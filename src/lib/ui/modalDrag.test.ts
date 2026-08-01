import { describe, expect, it } from "vitest";
import { clampOffset, isCentered, offsetFromDrag } from "@/lib/ui/modalDrag";

const viewport = { width: 1200, height: 800 };
const size = { width: 600, height: 400 };
// 端に 24px 残すので、可動域は横 ±(1200-48-600)/2 = ±276 / 縦 ±(800-48-400)/2 = ±176

describe("clampOffset", () => {
  it("可動域の中ならそのまま", () => {
    expect(clampOffset({ offset: { x: 100, y: -80 }, size, viewport })).toEqual({
      x: 100,
      y: -80,
    });
  });

  it("画面外へは出さない（タイトルバーを掴めなくなるため）", () => {
    expect(clampOffset({ offset: { x: 9999, y: 9999 }, size, viewport })).toEqual({
      x: 276,
      y: 176,
    });
    expect(clampOffset({ offset: { x: -9999, y: -9999 }, size, viewport })).toEqual({
      x: -276,
      y: -176,
    });
  });

  it("ちょうど端の値は通る", () => {
    expect(clampOffset({ offset: { x: 276, y: 176 }, size, viewport })).toEqual({
      x: 276,
      y: 176,
    });
  });

  it("余白を広げると可動域が狭くなる", () => {
    const { x } = clampOffset({ offset: { x: 9999, y: 0 }, size, viewport, margin: 100 });
    expect(x).toBe(200);
  });

  it("モーダルが画面より大きいときは動かせない", () => {
    const big = { width: 2000, height: 1500 };
    expect(clampOffset({ offset: { x: 300, y: 300 }, size: big, viewport })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("ウィンドウを縮めると位置が引き戻される（画面外に取り残されない）", () => {
    const placed = { x: 276, y: 176 };
    const shrunk = clampOffset({
      offset: placed,
      size,
      viewport: { width: 700, height: 500 },
    });
    expect(shrunk).toEqual({ x: 26, y: 26 });
  });

  it("NaN が来ても中央に戻すだけで壊れない", () => {
    expect(
      clampOffset({ offset: { x: Number.NaN, y: Number.NaN }, size, viewport }),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("offsetFromDrag", () => {
  it("掴んだ点からの移動量を足す", () => {
    const next = offsetFromDrag({ x: 10, y: 20 }, { x: 100, y: 100 }, { x: 150, y: 60 });
    expect(next).toEqual({ x: 60, y: -20 });
  });

  it("動かさなければ変わらない", () => {
    const start = { x: 10, y: 20 };
    expect(offsetFromDrag(start, { x: 100, y: 100 }, { x: 100, y: 100 })).toEqual(start);
  });

  it("連続したドラッグでも累積しない（開始位置を基準にする）", () => {
    const start = { x: 0, y: 0 };
    const origin = { x: 500, y: 300 };
    const a = offsetFromDrag(start, origin, { x: 520, y: 300 });
    const b = offsetFromDrag(start, origin, { x: 540, y: 300 });
    expect(a.x).toBe(20);
    expect(b.x).toBe(40);
  });
});

describe("isCentered", () => {
  it("中央かどうかを判定する", () => {
    expect(isCentered({ x: 0, y: 0 })).toBe(true);
    expect(isCentered({ x: 1, y: 0 })).toBe(false);
    expect(isCentered({ x: 0, y: -1 })).toBe(false);
  });
});
