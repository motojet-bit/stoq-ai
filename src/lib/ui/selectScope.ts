/**
 * Ctrl+A の範囲を、いま見ている本文だけに限る。
 *
 * **既定の Ctrl+A はページ全体を選ぶ。** デスクトップアプリの画面で
 * サイドバーやボタンのラベルまで選択されると、そのままコピーしても使えない。
 * 分析レポートの上で押したときは、レポート本文だけを選ぶ。
 */

/** この属性を持つ要素の中で押されたら、その要素だけを選ぶ。 */
export const SELECT_SCOPE_ATTR = "data-select-scope";

/**
 * Ctrl/Cmd + A かどうか。
 *
 * **入力欄の中では効かせない。** テキスト入力の全選択は
 * ブラウザ既定の挙動のほうが正しい。
 */
export function isSelectAll(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}): boolean {
  if (event.key !== "a" && event.key !== "A") return false;
  if (!event.ctrlKey && !event.metaKey) return false;

  const target = event.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return false;
  }
  return true;
}

/**
 * 押された位置から、選択対象の要素を探す。
 *
 * 見つからなければ null（既定の全選択に任せる）。
 */
export function scopeElementOf(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest(`[${SELECT_SCOPE_ATTR}]`);
}

/** 要素の中身だけを選択状態にする。 */
export function selectElementContents(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}
