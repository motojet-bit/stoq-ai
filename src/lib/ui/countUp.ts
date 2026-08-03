/**
 * 数値をカウントアップさせるための計算。
 *
 * **描画から切り離しておく。** アニメーションはテストしにくいが、
 * 「どの時刻にいくつを表示するか」だけなら純粋な計算にできる。
 */

/** 演出の長さ（ミリ秒）。長いと結果を読み始めるまで待たされる。 */
export const COUNT_UP_MS = 900;

/**
 * 終盤にかけて減速させる（ease-out）。
 *
 * 等速だと最後の 1 桁が急に止まって見え、
 * 「確定した」という感じが出ない。
 */
export function easeOut(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return 1 - (1 - clamped) ** 3;
}

/**
 * 経過時間から、いま表示すべき値を返す。
 *
 * **小数第 1 位まで**（スコアは 4.1 / 5 の形で出す）。
 */
export function countUpValue(target: number, elapsedMs: number, durationMs = COUNT_UP_MS): number {
  if (durationMs <= 0) return target;
  const value = target * easeOut(elapsedMs / durationMs);
  return Math.round(value * 10) / 10;
}

/** 演出が終わったか。 */
export function isCountUpDone(elapsedMs: number, durationMs = COUNT_UP_MS): boolean {
  return elapsedMs >= durationMs;
}
