import { useSyncExternalStore } from "react";

/**
 * 分析画面を左右 2 分割して、右に批判的検証ペインを出すかどうか。
 *
 * **既定は閉じておく。** ディベートは追加の API 費用がかかる機能なので、
 * 使うと決めた人だけが開く。開きっぱなしだと分析本文の幅がいつも半分になる。
 *
 * 端末ごとの好みなので localStorage に置く。
 */
const STORAGE_KEY = "stockanalyzer.debatePane";

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

let open = read();
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

export const subscribeDebatePane = subscribe;

export function useDebatePaneOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => open,
  );
}

export function getDebatePaneOpen(): boolean {
  return open;
}

export function setDebatePaneOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "open" : "closed");
  } catch {
    // 保存できなくても開閉自体は効く
  }
  emit();
}

export function toggleDebatePane(): void {
  setDebatePaneOpen(!open);
}
