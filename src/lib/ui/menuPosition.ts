/**
 * ポータルで開くメニューの位置決め。
 *
 * 親パネルの `overflow: hidden` に切られないよう、メニューは `document.body` 直下へ
 * 出す。そのぶん位置は自前で計算する必要がある。
 */

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface MenuPlacement {
  left: number;
  top: number;
  /** 下に入らず上へ出したか（アニメーションの向きに使う） */
  flipped: boolean;
  /** 画面に収まらないときの最大高さ。収まるなら null */
  maxHeight: number | null;
}

/** 画面端に最低限残す余白 */
export const MENU_MARGIN = 8;

/**
 * アンカー（ボタン）の下に出す位置を求める。
 *
 * - 右端がはみ出すなら左へ寄せる（アンカーの右端に揃える）
 * - 下に入らないなら上へ出す
 * - 上下どちらにも入らないなら、広いほうへ出して高さを制限する
 */
export function placeMenu(
  anchor: Rect,
  menu: Size,
  viewport: Size,
  margin = MENU_MARGIN,
): MenuPlacement {
  // 横: 既定はアンカーの右端そろえ。左に出過ぎるなら左端そろえへ
  let left = anchor.right - menu.width;
  if (left < margin) left = anchor.left;
  left = Math.min(Math.max(left, margin), Math.max(viewport.width - menu.width - margin, margin));

  const below = viewport.height - anchor.bottom - margin;
  const above = anchor.top - margin;

  if (menu.height <= below) {
    return { left, top: anchor.bottom, flipped: false, maxHeight: null };
  }
  if (menu.height <= above) {
    return { left, top: anchor.top - menu.height, flipped: true, maxHeight: null };
  }

  // どちらにも入らない → 広いほうへ出して高さを制限する
  if (below >= above) {
    return { left, top: anchor.bottom, flipped: false, maxHeight: Math.max(below, 80) };
  }
  return {
    left,
    top: margin,
    flipped: true,
    maxHeight: Math.max(above, 80),
  };
}

/** `getBoundingClientRect()` の結果を扱いやすい形に写す。 */
export function toRect(rect: DOMRect): Rect {
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  };
}
