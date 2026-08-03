/**
 * 横方向にはみ出しているかの判定。
 *
 * **「入りきっていない」ことが見えないと、ユーザーは打つ手が分からない。**
 * 隠れているものがあると分かれば、窓を広げるか横へ送るかを選べる。
 */

export interface OverflowState {
  /** 右側に隠れているものがあるか */
  right: boolean;
  /** 左側に隠れているものがあるか（横スクロールしたあと） */
  left: boolean;
}

/**
 * 端の判定に使う遊び（px）。
 *
 * **0 で比べない。** ブラウザは幅を小数で持つので、
 * ぴったり収まっていても 0.5px ほどの差が出て、
 * インジケーターが出たり消えたりする。
 */
const EPSILON = 2;

export function measureOverflow(el: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}): OverflowState {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= EPSILON) return { left: false, right: false };

  return {
    left: el.scrollLeft > EPSILON,
    right: el.scrollLeft < max - EPSILON,
  };
}
