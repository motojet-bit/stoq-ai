import { useSyncExternalStore } from "react";

/** 配置できるパネル */
export type PanelId = "market" | "analysis" | "chat";

/** 画面上の配置枠 */
export type SlotId = "leftTop" | "leftBottom" | "right";

export type Slots = Record<SlotId, PanelId>;

export const SLOT_IDS: SlotId[] = ["leftTop", "leftBottom", "right"];

export const PANEL_TITLES: Record<PanelId, string> = {
  market: "市場データ",
  analysis: "分析結果",
  chat: "対話",
};

const STORAGE_KEY = "stockanalyzer.slots";

const DEFAULT_SLOTS: Slots = {
  leftTop: "market",
  leftBottom: "chat",
  right: "analysis",
};

/**
 * 2 つの枠の中身を入れ替える。
 *
 * ドラッグ元とドロップ先が同じ場合はそのまま返す。
 */
export function swapSlots(slots: Slots, from: SlotId, to: SlotId): Slots {
  if (from === to) return slots;
  return { ...slots, [from]: slots[to], [to]: slots[from] };
}

/** パネルがどの枠にあるかを引く。 */
export function slotOf(slots: Slots, panel: PanelId): SlotId | null {
  return SLOT_IDS.find((slot) => slots[slot] === panel) ?? null;
}

/** 保存値が壊れていても必ず正しい配置を返す（3 枠に 3 パネルが 1 つずつ）。 */
export function normalizeSlots(value: unknown): Slots {
  if (typeof value !== "object" || value === null) return DEFAULT_SLOTS;

  const candidate = value as Partial<Record<SlotId, unknown>>;
  const seen = new Set<PanelId>();
  const result: Partial<Slots> = {};

  for (const slot of SLOT_IDS) {
    const panel = candidate[slot];
    if (
      (panel === "market" || panel === "analysis" || panel === "chat") &&
      !seen.has(panel)
    ) {
      seen.add(panel);
      result[slot] = panel;
    }
  }

  // 埋まらなかった枠に、余っているパネルを順に入れる
  const remaining = (["market", "analysis", "chat"] as PanelId[]).filter(
    (p) => !seen.has(p),
  );
  for (const slot of SLOT_IDS) {
    if (!result[slot]) result[slot] = remaining.shift() ?? DEFAULT_SLOTS[slot];
  }

  return result as Slots;
}

function readStored(): Slots {
  if (typeof localStorage === "undefined") return DEFAULT_SLOTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSlots(JSON.parse(raw)) : DEFAULT_SLOTS;
  } catch {
    return DEFAULT_SLOTS;
  }
}

let slots: Slots = readStored();
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

export function useSlots(): Slots {
  return useSyncExternalStore(
    subscribe,
    () => slots,
    () => slots,
  );
}

export function getSlots(): Slots {
  return slots;
}

export function movePanel(from: SlotId, to: SlotId): Slots {
  slots = swapSlots(slots, from, to);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // 保存できなくても動作は続ける
  }
  emit();
  return slots;
}

export function resetSlots(): Slots {
  slots = DEFAULT_SLOTS;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
  emit();
  return slots;
}
