import { useSyncExternalStore } from "react";

/**
 * いま開いているメニュー（ドロップダウン）の数。
 *
 * **メニューが開いている間はツールチップを出さない。**
 * 吹き出しがメニューに重なると、どちらも読めなくなるため。
 * 複数のメニューが同時に開きうるので、真偽値ではなく数で持つ。
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 購読を外から張れるようにする（React の外・テスト用）。 */
export const subscribeOverlay = subscribe;

export function useAnyMenuOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openCount > 0,
    () => openCount > 0,
  );
}

export function isAnyMenuOpen(): boolean {
  return openCount > 0;
}

export function openMenu(): void {
  openCount += 1;
  // 0 → 1 のときだけ状態が変わる
  if (openCount === 1) emit();
}

export function closeMenu(): void {
  if (openCount === 0) return;
  openCount -= 1;
  if (openCount === 0) emit();
}

/** テスト用。開いたままのメニューを全部閉じる。 */
export function resetOverlays(): void {
  if (openCount === 0) return;
  openCount = 0;
  emit();
}
