/**
 * ショートカットキーの表記と照合。
 *
 * キーは `Ctrl+Shift+N` のような文字列で表す。
 * 修飾キーの順序は **Ctrl → Alt → Shift → Meta** に正規化するので、
 * 同じ組み合わせなら書き方が違っても一致する。
 *
 * macOS の Cmd は `Meta` として扱い、表示だけ `⌘` に置き換える。
 */

/** macOS 上で動いているか。修飾キーの表記を変えるために使う。 */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** 押されたキーの状態。DOM に依存させないためのかたち */
export interface KeyChord {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** 修飾キー単体は割り当てとして成立しない */
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS", "CapsLock"]);

/** 表示名の揺れを吸収する */
const KEY_ALIASES: Record<string, string> = {
  esc: "Escape",
  escape: "Escape",
  del: "Delete",
  delete: "Delete",
  ins: "Insert",
  space: "Space",
  spacebar: "Space",
  return: "Enter",
  enter: "Enter",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  plus: "+",
  comma: ",",
};

function canonicalKey(key: string): string {
  const lower = key.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  // 1 文字キーは大文字に揃える（Shift の有無で a/A が変わるため）
  if (key.length === 1) return key.toUpperCase();
  // F1 / ArrowUp などは先頭を大文字にした形に寄せる
  if (/^f\d{1,2}$/i.test(key)) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** 修飾キーだけの入力か（割り当てとして無効） */
export function isModifierOnly(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

/** キーの組み合わせを正規化した文字列にする。 */
export function formatChord(chord: KeyChord): string {
  if (isModifierOnly(chord.key)) return "";

  const parts: string[] = [];
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  if (chord.meta) parts.push("Meta");
  parts.push(canonicalKey(chord.key));
  return parts.join("+");
}

/** `ctrl+shift+n` のような文字列を正規化する。空文字は「割り当てなし」。 */
export function normalizeBinding(binding: string): string {
  const trimmed = binding.trim();
  if (trimmed === "") return "";

  const tokens = trimmed.split("+").map((t) => t.trim()).filter((t) => t !== "");
  // 末尾が空（`Ctrl+` など）なら主キーが無い
  const chord: KeyChord = { key: "", ctrl: false, alt: false, shift: false, meta: false };

  for (const token of tokens) {
    switch (token.toLowerCase()) {
      case "ctrl":
      case "control":
        chord.ctrl = true;
        break;
      case "alt":
      case "option":
        chord.alt = true;
        break;
      case "shift":
        chord.shift = true;
        break;
      case "meta":
      case "cmd":
      case "command":
        chord.meta = true;
        break;
      default:
        chord.key = token;
    }
  }

  if (chord.key === "") return "";
  return formatChord(chord);
}

/** キーボードイベントから割り当て文字列を作る。 */
export function bindingFromEvent(e: KeyboardEvent): string {
  return formatChord({
    key: e.key === " " ? "Space" : e.key,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  });
}

/**
 * 画面に出す表記。macOS では修飾キーを記号にする。
 * 未割り当ては「—」を返す。
 */
export function displayBinding(binding: string, mac = false): string {
  if (binding === "") return "—";
  if (!mac) return binding;
  return binding
    .replace(/Meta/g, "⌘")
    .replace(/Alt/g, "⌥")
    .replace(/Ctrl/g, "⌃")
    .replace(/Shift/g, "⇧");
}

/**
 * 同じキーが複数のアクションに割り当たっていないか調べる。
 * 未割り当て（空文字）は重複とみなさない。
 */
export function findConflicts(bindings: Record<string, string>): Record<string, string[]> {
  const byBinding = new Map<string, string[]>();
  for (const [action, binding] of Object.entries(bindings)) {
    if (binding === "") continue;
    const list = byBinding.get(binding) ?? [];
    list.push(action);
    byBinding.set(binding, list);
  }

  const conflicts: Record<string, string[]> = {};
  for (const [binding, actions] of byBinding) {
    if (actions.length > 1) conflicts[binding] = actions;
  }
  return conflicts;
}
