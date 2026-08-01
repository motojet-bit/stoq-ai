import { useSyncExternalStore } from "react";

/**
 * マイポートフォリオ画面の 2 ペイン分割方向。
 *
 * 過去ログを読みながら AI に聞く画面なので、
 * **横に並べたい人（対比）と上下に並べたい人（長文重視）の両方がいる。**
 * 選択は端末ごとの好みなので localStorage に置く。
 */
export type SplitDirection = "vertical" | "horizontal";

const STORAGE_KEY = "stockanalyzer.portfolioSplit";
/** 既定は左右。過去ログと対話を見比べやすい */
const DEFAULT_DIRECTION: SplitDirection = "horizontal";

/** 保存値が壊れていても必ず有効な向きを返す。 */
export function normalizeDirection(value: unknown): SplitDirection {
  return value === "vertical" || value === "horizontal" ? value : DEFAULT_DIRECTION;
}

function read(): SplitDirection {
  try {
    return normalizeDirection(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_DIRECTION;
  }
}

let direction: SplitDirection = read();
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
export const subscribePortfolioSplit = subscribe;

export function usePortfolioSplit(): SplitDirection {
  return useSyncExternalStore(
    subscribe,
    () => direction,
    () => direction,
  );
}

export function getPortfolioSplit(): SplitDirection {
  return direction;
}

export function setPortfolioSplit(next: SplitDirection): void {
  const normalized = normalizeDirection(next);
  // 変わっていないなら再描画を起こさない
  if (normalized === direction) return;

  direction = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // 保存できなくても動作は続ける
  }
  emit();
}

export function togglePortfolioSplit(): void {
  setPortfolioSplit(direction === "horizontal" ? "vertical" : "horizontal");
}
