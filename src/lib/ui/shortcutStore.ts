import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import { normalizeBinding } from "@/lib/ui/shortcutKeys";
import { t } from "@/lib/i18n/i18n";

/**
 * ショートカットキーの管理基盤。
 *
 * **アクションの一覧と既定キーはここ（フロント側）が持ち、
 * ユーザーが変更した割り当てだけを Rust 側の `shortcuts` テーブルに保存する。**
 * 既定値を両方に置くと、既定を変えたときに古い値が残ってしまうため。
 */

export type ShortcutAction =
  | "chat.new"
  | "chat.send"
  | "candidates.add"
  | "sidebar.toggle"
  | "ticker.focus"
  | "analysis.run"
  | "app.settings";

export interface ShortcutDefinition {
  action: ShortcutAction;
  /** 表示名の辞書キー。**定数に文面を焼かない**（言語切替に追従しないため） */
  labelKey: string;
  /** 何のためのキーかの補足（辞書キー） */
  hintKey: string;
  defaultBinding: string;
  /**
   * 入力欄の中でも効かせるか。
   * 既定では入力中のキーを奪わない（文字が打てなくなるため）。
   */
  allowInInput?: boolean;
  /**
   * 個別のコンポーネントが処理するもの。
   * 一覧には出すが、全体のキーハンドラでは発火させない。
   */
  handledLocally?: boolean;
}

export const SHORTCUTS: ShortcutDefinition[] = [
  {
    action: "chat.new",
    labelKey: "shortcut.chatNew",
    hintKey: "shortcut.chatNewHint",
    defaultBinding: "Ctrl+N",
  },
  {
    action: "candidates.add",
    labelKey: "shortcut.candidateAdd",
    hintKey: "shortcut.candidateAddHint",
    defaultBinding: "Ctrl+Shift+A",
  },
  {
    action: "ticker.focus",
    labelKey: "shortcut.tickerFocus",
    hintKey: "shortcut.tickerFocusHint",
    defaultBinding: "Ctrl+L",
  },
  {
    action: "analysis.run",
    labelKey: "shortcut.analysisRun",
    hintKey: "shortcut.analysisRunHint",
    defaultBinding: "Ctrl+Shift+Enter",
  },
  {
    action: "sidebar.toggle",
    labelKey: "shortcut.sidebarToggle",
    hintKey: "shortcut.sidebarToggleHint",
    defaultBinding: "Ctrl+B",
  },
  {
    action: "app.settings",
    labelKey: "shortcut.settingsOpen",
    hintKey: "shortcut.settingsOpenHint",
    defaultBinding: "Ctrl+,",
  },
  {
    action: "chat.send",
    labelKey: "shortcut.chatSend",
    hintKey: "shortcut.chatSendHint",
    defaultBinding: "Ctrl+Enter",
    allowInInput: true,
    handledLocally: true,
  },
];

interface StoredOverride {
  action: string;
  binding: string;
}

/** アクション → 割り当て。既定に上書きを重ねたもの */
export type BindingMap = Record<ShortcutAction, string>;

/** 既定に上書きを重ねる。知らないアクションの上書きは無視する。 */
export function mergeBindings(overrides: StoredOverride[]): BindingMap {
  const map = {} as BindingMap;
  for (const def of SHORTCUTS) {
    map[def.action] = def.defaultBinding;
  }
  for (const { action, binding } of overrides) {
    if (action in map) {
      map[action as ShortcutAction] = normalizeBinding(binding);
    }
  }
  return map;
}

let overrides: StoredOverride[] = [];
let bindings: BindingMap = mergeBindings([]);

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

export function useBindings(): BindingMap {
  return useSyncExternalStore(
    subscribe,
    () => bindings,
    () => bindings,
  );
}

export function getBindings(): BindingMap {
  return bindings;
}

/** そのアクションが既定から変更されているか */
export function isCustomized(action: ShortcutAction): boolean {
  return overrides.some((o) => o.action === action);
}

function replace(next: StoredOverride[]) {
  overrides = next;
  bindings = mergeBindings(next);
  emit();
}

export async function loadShortcuts(): Promise<void> {
  if (!isTauri()) return;
  try {
    replace(await invoke<StoredOverride[]>("shortcuts_list"));
  } catch (e) {
    toastError(t("toast.shortcut.loadFailed"), e);
  }
}

/** `binding` に null を渡すと既定へ戻す。 */
export async function setShortcut(
  action: ShortcutAction,
  binding: string | null,
): Promise<void> {
  try {
    replace(
      await invoke<StoredOverride[]>("shortcuts_set", {
        action,
        binding: binding === null ? null : normalizeBinding(binding),
      }),
    );
  } catch (e) {
    toastError(t("toast.shortcut.saveFailed"), e);
  }
}

export async function resetShortcuts(): Promise<void> {
  try {
    replace(await invoke<StoredOverride[]>("shortcuts_reset"));
  } catch (e) {
    toastError(t("toast.shortcut.resetFailed"), e);
  }
}

/**
 * 押されたキーに対応するアクションを引く。
 *
 * `inInput` が true（入力欄にフォーカスがある）ときは、
 * `allowInInput` のものしか発火させない。文字入力を奪わないため。
 */
export function resolveAction(
  binding: string,
  inInput: boolean,
): ShortcutDefinition | null {
  if (binding === "") return null;
  for (const def of SHORTCUTS) {
    if (def.handledLocally) continue;
    if (bindings[def.action] !== binding) continue;
    if (inInput && !def.allowInInput) continue;
    return def;
  }
  return null;
}
