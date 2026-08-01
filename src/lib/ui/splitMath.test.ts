import { describe, expect, it } from "vitest";
import { clampFirstSize, desiredFirstSize } from "@/lib/ui/splitMath";

/**
 * リサイズの境界値。
 * パネルが潰れて操作できなくなる／画面外へはみ出すことがないかを確認する。
 */
describe("clampFirstSize", () => {
  const base = { total: 1000, minFirst: 200, minSecond: 150 };

  it("通常範囲ではドラッグ位置をそのまま使う", () => {
    expect(clampFirstSize({ ...base, desired: 400 })).toBe(400);
  });

  it("1 番目の最小を下回らない", () => {
    expect(clampFirstSize({ ...base, desired: 10 })).toBe(200);
    expect(clampFirstSize({ ...base, desired: -500 })).toBe(200);
  });

  it("2 番目の最小を侵食しない", () => {
    // total 1000 - minSecond 150 = 850 が上限
    expect(clampFirstSize({ ...base, desired: 990 })).toBe(850);
    expect(clampFirstSize({ ...base, desired: 100_000 })).toBe(850);
  });

  it("ちょうど境界の値はそのまま通る", () => {
    expect(clampFirstSize({ ...base, desired: 200 })).toBe(200);
    expect(clampFirstSize({ ...base, desired: 850 })).toBe(850);
  });

  it("両方の最小を満たせないほど狭い場合は 2 番目を優先する", () => {
    // total 300, minSecond 150 → 1 番目は最大 150（minFirst 200 に届かない）
    const narrow = clampFirstSize({ total: 300, minFirst: 200, minSecond: 150, desired: 250 });
    expect(narrow).toBe(150);
    expect(narrow).toBeGreaterThanOrEqual(0);
  });

  it("コンテナが 0 でも負のサイズを返さない", () => {
    expect(clampFirstSize({ total: 0, minFirst: 200, minSecond: 150, desired: 100 })).toBe(0);
  });

  it("NaN が来ても最小サイズにフォールバックする", () => {
    expect(clampFirstSize({ ...base, desired: Number.NaN })).toBe(200);
  });
});

/**
 * ドラッグ方向の意味。
 * 仕切り線がポインタに追従することが直感的な操作の条件。
 */
describe("desiredFirstSize（ドラッグ方向）", () => {
  const rect = { top: 100, left: 50 };

  it("縦分割: 下へ引くと上のペインが広がる", () => {
    const upper = desiredFirstSize({ vertical: true, pointer: { x: 0, y: 300 }, rect });
    const lower = desiredFirstSize({ vertical: true, pointer: { x: 0, y: 500 }, rect });
    expect(lower).toBeGreaterThan(upper);
  });

  it("縦分割: 上へ引くと上のペインが縮む（＝下の対話が広がる）", () => {
    const start = desiredFirstSize({ vertical: true, pointer: { x: 0, y: 400 }, rect });
    const draggedUp = desiredFirstSize({ vertical: true, pointer: { x: 0, y: 250 }, rect });
    expect(draggedUp).toBeLessThan(start);
    expect(start - draggedUp).toBe(150);
  });

  it("縦分割: 仕切り線がポインタに正確に追従する", () => {
    // ポインタ Y=420、コンテナ上端 100 → 上のペインは 320px
    expect(desiredFirstSize({ vertical: true, pointer: { x: 0, y: 420 }, rect })).toBe(320);
  });

  it("横分割: 右へ引くと左のペインが広がる", () => {
    const left = desiredFirstSize({ vertical: false, pointer: { x: 200, y: 0 }, rect });
    const right = desiredFirstSize({ vertical: false, pointer: { x: 600, y: 0 }, rect });
    expect(right).toBeGreaterThan(left);
    expect(right).toBe(550);
  });

  it("中身が空でも計算はポインタ位置だけで決まる（＝空でもリサイズできる）", () => {
    // コンテナの中身に依存しないことを、同じポインタ位置で同じ結果になることで確認
    const a = desiredFirstSize({ vertical: true, pointer: { x: 0, y: 380 }, rect });
    const b = desiredFirstSize({ vertical: true, pointer: { x: 0, y: 380 }, rect });
    expect(a).toBe(b);
    expect(a).toBe(280);
  });
});
