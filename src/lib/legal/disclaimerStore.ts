import { useSyncExternalStore } from "react";

/**
 * 免責事項モーダルの開閉。
 *
 * メニューバー・テロップ・ヘルプなど**複数の入口から開く**ので、
 * どこか 1 つのコンポーネントに状態を持たせず、外部ストアにしている。
 */
let open = false;
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
export const subscribeDisclaimer = subscribe;

export function useDisclaimerOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open,
  );
}

export function isDisclaimerOpen(): boolean {
  return open;
}

export function openDisclaimer(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeDisclaimer(): void {
  if (!open) return;
  open = false;
  emit();
}

export function toggleDisclaimer(): void {
  open = !open;
  emit();
}
