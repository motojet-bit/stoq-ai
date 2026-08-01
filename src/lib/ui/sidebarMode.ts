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

/**
 * 選択中のタブを先頭（左）へ寄せた並びを返す。
 *
 * **アクティブなタブは必ず左端に置き、ラベルを省略させない。**
 * 幅が足りないと右側のタブが「マイポートフ…」と切れるが、
 * いま見ているモードの名前が読めないのがいちばん困るため。
 */
export function orderedModes(active: SidebarMode): { id: SidebarMode; label: string }[] {
  const current = SIDEBAR_MODES.filter((m) => m.id === active);
  const rest = SIDEBAR_MODES.filter((m) => m.id !== active);
  return [...current, ...rest];
}

const STORAGE_KEY = "stockanalyzer.sidebarMode";

/** サイドバーの幅（px）。ドラッグで変えられる */
const WIDTH_KEY = "stockanalyzer.sidebarWidth";
export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 480;
/** 「💼 マイポートフォリオ」が省略されずに収まる幅 */
export const DEFAULT_SIDEBAR_WIDTH = 288;

/** 範囲外の幅を丸める。 */
export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.round(Math.min(Math.max(value, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH));
}

export function readSidebarWidth(): number {
  try {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampSidebarWidth(raw) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function storeSidebarWidth(value: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(clampSidebarWidth(value)));
  } catch {
    // 保存できなくても動作は続ける
  }
}
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
