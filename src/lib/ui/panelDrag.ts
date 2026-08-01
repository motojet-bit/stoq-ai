import { useSyncExternalStore } from "react";
import { movePanel, SLOT_IDS, type SlotId } from "@/lib/ui/layoutStore";

/**
 * パネルのドラッグ移動（ドッキング配置変更）の状態。
 *
 * **HTML5 Drag and Drop ではなく Pointer Events で実装している。**
 * Tauri / WebView2 では `draggable` によるネイティブドラッグが
 * 実機で成立しないことがあるうえ、`draggable` を付けた要素では
 * ネイティブドラッグが pointermove を奪ってしまうため、
 * 両者を同じ要素で併用することはできない。
 * Pointer Events なら OS のドラッグ機構を介さないので確実に動く。
 */
export interface PanelDragState {
  /** つかんだ枠 */
  from: SlotId;
  /** いまカーソルが乗っている枠（無ければ null） */
  over: SlotId | null;
  x: number;
  y: number;
}

/** ドロップ先を判定するために各パネルの根に付ける属性名 */
export const PANEL_SLOT_ATTR = "data-panel-slot";

const BODY_CLASS = "is-dragging-panel";

/**
 * 入れ替えを実行すべきドロップ先を返す。
 * 枠の外で離した場合と、つかんだ枠の上で離した場合は何もしない。
 */
export function resolveDrop(from: SlotId, over: SlotId | null): SlotId | null {
  if (over === null || over === from) return null;
  return over;
}

function isSlotId(value: string | null | undefined): value is SlotId {
  return SLOT_IDS.includes(value as SlotId);
}

/** 画面座標の下にあるパネルの枠を求める。 */
export function slotFromPoint(x: number, y: number): SlotId | null {
  if (typeof document === "undefined") return null;
  const element = document.elementFromPoint(x, y);
  const host = element?.closest(`[${PANEL_SLOT_ATTR}]`) ?? null;
  const slot = host?.getAttribute(PANEL_SLOT_ATTR);
  return isSlotId(slot) ? slot : null;
}

let state: PanelDragState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setBodyDragging(active: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(BODY_CLASS, active);
}

export function startPanelDrag(from: SlotId, x: number, y: number): void {
  state = { from, over: from, x, y };
  setBodyDragging(true);
  emit();
}

export function updatePanelDrag(x: number, y: number): void {
  if (!state) return;
  state = { ...state, x, y, over: slotFromPoint(x, y) };
  emit();
}

/**
 * ドラッグを終了し、必要なら配置を入れ替える。
 * 実際に入れ替えた枠を返す（何もしなかった場合は null）。
 */
export function endPanelDrag(): SlotId | null {
  if (!state) return null;
  const target = resolveDrop(state.from, state.over);
  const from = state.from;
  state = null;
  setBodyDragging(false);
  emit();
  if (target) movePanel(from, target);
  return target;
}

/** 入れ替えずに中断する（Esc / pointercancel）。 */
export function cancelPanelDrag(): void {
  if (!state) return;
  state = null;
  setBodyDragging(false);
  emit();
}

export function getPanelDrag(): PanelDragState | null {
  return state;
}

export function usePanelDrag(): PanelDragState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
    () => state,
  );
}
