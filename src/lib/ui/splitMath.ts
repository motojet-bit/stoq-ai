/**
 * スプリッターのサイズ計算。
 *
 * UI から切り離しておくことで、境界値（極端に狭い / 広い）と
 * ドラッグ方向の意味を自動テストできる。
 *
 * ## なぜ「1 番目のペイン」をサイズ指定するのか
 *
 * 2 番目を固定サイズにすると、1 番目が `flex-1` になる。
 * すると**中身が空のとき 1 番目が 0 まで潰れて仕切り線が動かせなくなる**
 * （ティッカー未入力の初期状態でリサイズできなかった原因）。
 *
 * 1 番目に明示サイズを与え、2 番目に残りを割り当てる形にすると、
 * 中身の有無にかかわらず仕切り線の位置が保たれる。
 */

export interface ClampInput {
  /** ドラッグ位置から求めた 1 番目のペインの希望サイズ */
  desired: number;
  /** コンテナ全体のサイズ */
  total: number;
  minFirst: number;
  minSecond: number;
}

/**
 * 1 番目のペインのサイズを、両方の最小サイズを満たす範囲に丸める。
 *
 * コンテナが狭すぎて両方の最小を満たせない場合は、
 * **2 番目の最小を優先**して 1 番目を縮める
 * （下段の入力欄など、操作対象が消えないようにする）。
 */
export function clampFirstSize({
  desired,
  total,
  minFirst,
  minSecond,
}: ClampInput): number {
  const safeTotal = Math.max(total, 0);
  const upper = safeTotal - minSecond;

  // 両方の最小を満たせないほど狭い場合
  if (upper < minFirst) {
    return Math.max(Math.min(safeTotal, upper), 0);
  }

  const value = Number.isFinite(desired) ? desired : minFirst;
  return Math.min(Math.max(value, minFirst), upper);
}

/**
 * ポインタ位置から 1 番目のペインの希望サイズを求める。
 *
 * 仕切り線がポインタに追従する（＝直接操作）ため、方向は直感どおりになる。
 * - 縦分割: 下へ引く → 上（1 番目）が広がる / 上へ引く → 下（2 番目）が広がる
 * - 横分割: 右へ引く → 左（1 番目）が広がる / 左へ引く → 右（2 番目）が広がる
 */
export function desiredFirstSize(params: {
  vertical: boolean;
  pointer: { x: number; y: number };
  rect: { top: number; left: number };
}): number {
  const { vertical, pointer, rect } = params;
  return vertical ? pointer.y - rect.top : pointer.x - rect.left;
}
