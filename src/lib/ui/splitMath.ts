/**
 * スプリッターのサイズ計算。
 *
 * UI から切り離しておくことで、境界値（極端に狭い / 広い）を自動テストできる。
 */

export interface ClampInput {
  /** ドラッグ位置から求めた 2 番目のパネルの希望サイズ */
  desired: number;
  /** コンテナ全体のサイズ */
  total: number;
  minFirst: number;
  minSecond: number;
}

/**
 * 2 番目のパネルのサイズを、両方の最小サイズを満たす範囲に丸める。
 *
 * コンテナが狭すぎて両方の最小を満たせない場合は、
 * **1 番目の最小を優先**して 2 番目を縮める（操作対象が消えないようにする）。
 */
export function clampSecondSize({
  desired,
  total,
  minFirst,
  minSecond,
}: ClampInput): number {
  const safeTotal = Math.max(total, 0);
  const upper = safeTotal - minFirst;

  // 両方の最小を満たせないほど狭い場合
  if (upper < minSecond) {
    return Math.max(Math.min(safeTotal, upper), 0);
  }

  const value = Number.isFinite(desired) ? desired : minSecond;
  return Math.min(Math.max(value, minSecond), upper);
}
