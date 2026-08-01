import { useSyncExternalStore } from "react";

/**
 * 表示まわりの好み。端末ごとの設定なので localStorage に置く。
 *
 * ツールチップは初心者には助けになるが、慣れると邪魔になる。
 * **既定は ON**（初めて触る人を基準にする）。
 */
const TOOLTIP_KEY = "stockanalyzer.showTooltips";

function read(): boolean {
  try {
    // 未設定なら ON
    return localStorage.getItem(TOOLTIP_KEY) !== "0";
  } catch {
    return true;
  }
}

let showTooltips = read();
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

export function useShowTooltips(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => showTooltips,
    () => showTooltips,
  );
}

export function getShowTooltips(): boolean {
  return showTooltips;
}

export function setShowTooltips(value: boolean): void {
  showTooltips = value;
  try {
    localStorage.setItem(TOOLTIP_KEY, value ? "1" : "0");
  } catch {
    // 保存できなくても動作は続ける
  }
  emit();
}
