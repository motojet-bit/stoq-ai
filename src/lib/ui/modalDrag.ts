/**
 * モーダルのドラッグ移動。
 *
 * モーダルは flex で中央寄せしているので、位置は **中央からのずれ（offset）** で持つ。
 * 絶対座標にすると、ウィンドウをリサイズしたときに画面外へ取り残される。
 */

export interface Offset {
  x: number;
  y: number;
}

export interface ClampInput {
  offset: Offset;
  /** モーダル本体の大きさ */
  size: { width: number; height: number };
  /** 表示領域の大きさ */
  viewport: { width: number; height: number };
  /** 画面端に最低限残す余白（掴み直せなくならないように） */
  margin?: number;
}

export const DEFAULT_MARGIN = 24;

/**
 * ずれを画面内に収める。
 *
 * **完全に画面外へ出さない**のが目的。タイトルバーが掴めなくなると
 * 閉じることも動かすこともできなくなるため。
 */
export function clampOffset({
  offset,
  size,
  viewport,
  margin = DEFAULT_MARGIN,
}: ClampInput): Offset {
  /*
   * 中央からどれだけ動かせるか。
   * 端に `margin` の余白を残した範囲に収める。モーダルが画面より大きいときは
   * 0 に潰れて動かせなくなる（すでに画面いっぱいなので動かす意味がない）。
   */
  const limit = (viewportSize: number, modalSize: number) =>
    Math.max(0, (viewportSize - margin * 2 - modalSize) / 2);

  const limitX = limit(viewport.width, size.width);
  const limitY = limit(viewport.height, size.height);

  const clamp = (value: number, limit: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, -limit), limit);
  };

  return { x: clamp(offset.x, limitX), y: clamp(offset.y, limitY) };
}

/** ドラッグ開始点からの移動量を、いまのずれに足す。 */
export function offsetFromDrag(
  start: Offset,
  origin: { x: number; y: number },
  pointer: { x: number; y: number },
): Offset {
  return { x: start.x + (pointer.x - origin.x), y: start.y + (pointer.y - origin.y) };
}

/** 位置をリセットしたか判定する（「中央に戻す」ボタンの活性用）。 */
export function isCentered(offset: Offset): boolean {
  return offset.x === 0 && offset.y === 0;
}
