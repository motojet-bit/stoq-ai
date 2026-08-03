import { describe, expect, it } from "vitest";
import { measureOverflow } from "@/lib/ui/overflow";

const el = (scrollWidth: number, clientWidth: number, scrollLeft = 0) => ({
  scrollWidth,
  clientWidth,
  scrollLeft,
});

describe("横方向のはみ出し判定", () => {
  it("収まっていれば両側とも false", () => {
    expect(measureOverflow(el(200, 200))).toEqual({ left: false, right: false });
  });

  it("右に隠れていれば right", () => {
    expect(measureOverflow(el(400, 200))).toEqual({ left: false, right: true });
  });

  it("横へ送ったら left も立つ", () => {
    expect(measureOverflow(el(400, 200, 100))).toEqual({ left: true, right: true });
  });

  it("右端まで送ったら right は下りる", () => {
    expect(measureOverflow(el(400, 200, 200))).toEqual({ left: true, right: false });
  });

  it("**小数の誤差では出さない**（出たり消えたりして目障りになる）", () => {
    // ぴったり収まっているのに 1px ぶんの差が出るケース
    expect(measureOverflow(el(200.5, 200))).toEqual({ left: false, right: false });
    expect(measureOverflow(el(400, 200, 199))).toEqual({ left: true, right: false });
  });

  it("幅ゼロでも落ちない（描画前に呼ばれることがある）", () => {
    expect(measureOverflow(el(0, 0))).toEqual({ left: false, right: false });
  });
});
