import { useSyncExternalStore } from "react";

/**
 * ブロックごとの折りたたみ状態。
 *
 * **端末ごとの好みなので localStorage に置く。** 毎回同じブロックを
 * 畳み直させるのは手間で、「読みたいところだけ開いておく」使い方ができない。
 *
 * 状態は**畳んでいるものだけ**を持つ。既定を「開いている」にしておけば、
 * ブロックが増えたときに勝手に隠れることがない。
 */

const STORAGE_KEY = "stockanalyzer.collapsedSections";

/**
 * 既定で畳んでおくブロック。
 *
 * 貼り付け用フォーマットは**普段は読まない**（表計算へ移すときだけ要る）ので、
 * 開いたままだと本文がその分だけ下へ押し出される。
 */
const DEFAULT_COLLAPSED = ["pasteFormat", "histRawBody"];

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set(DEFAULT_COLLAPSED);
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set(DEFAULT_COLLAPSED);
  }
}

let collapsed = read();
const listeners = new Set<() => void>();
// 参照が変わらないと useSyncExternalStore が再描画しないので版を持つ
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // 保存できなくても開閉自体は効く
  }
}

/** そのブロックが畳まれているか。 */
export function useCollapsed(id: string): boolean {
  const snapshot = () => {
    void version;
    return collapsed.has(id);
  };
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function isCollapsed(id: string): boolean {
  return collapsed.has(id);
}

export function toggleSection(id: string): void {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed = next;
  persist();
  emit();
}

/** テスト用。既定へ戻す。 */
export function resetCollapsedSections(): void {
  collapsed = new Set(DEFAULT_COLLAPSED);
  emit();
}
