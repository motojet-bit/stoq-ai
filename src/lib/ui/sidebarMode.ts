import { useSyncExternalStore } from "react";

/**
 * 左サイドバーの表示モード。
 *
 * 会話を追うときと、銘柄を長期で管理するときでは見たいものが違う。
 * **同じ場所に両方を詰め込むと、どちらも見づらくなる**ので切り替える。
 * 選択は端末ごとの好みなので localStorage に置く。
 */
export type SidebarMode = "chat" | "portfolio";

export const SIDEBAR_MODES: { id: SidebarMode; label: string }[] = [
  { id: "chat", label: "💬 対話履歴" },
  { id: "portfolio", label: "💼 マイポートフォリオ" },
];

const STORAGE_KEY = "stockanalyzer.sidebarMode";
const DEFAULT_MODE: SidebarMode = "chat";

/** 保存値が壊れていても必ず有効なモードを返す。 */
export function normalizeMode(value: unknown): SidebarMode {
  return value === "portfolio" || value === "chat" ? value : DEFAULT_MODE;
}

function read(): SidebarMode {
  try {
    return normalizeMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

let mode: SidebarMode = read();
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
export const subscribeSidebarMode = subscribe;

export function useSidebarMode(): SidebarMode {
  return useSyncExternalStore(
    subscribe,
    () => mode,
    () => mode,
  );
}

export function getSidebarMode(): SidebarMode {
  return mode;
}

export function setSidebarMode(next: SidebarMode): void {
  const normalized = normalizeMode(next);
  // 変わっていないなら再描画を起こさない
  if (normalized === mode) return;

  mode = normalized;
  try {
    localStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    // 保存できなくても動作は続ける
  }
  emit();
}
