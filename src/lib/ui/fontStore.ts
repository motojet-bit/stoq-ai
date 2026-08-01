import { useSyncExternalStore } from "react";

/**
 * アプリ全体の基準フォントサイズ（px）。
 *
 * 10〜20px を 1px 刻みで調整でき、市場データ・分析結果・対話のすべてに連動する。
 * 実際の適用は `:root` の CSS 変数 `--fs-base` を書き換えることで行うため、
 * コンポーネント側は `.t-body` / `.t-label` などのクラスを付けるだけでよい。
 */
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 20;
export const DEFAULT_FONT_SIZE = 13;

const STORAGE_KEY = "stockanalyzer.fontSize";

/** 範囲内に丸める。小数や NaN も安全に扱う。 */
export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE;
  return Math.min(Math.max(Math.round(value), MIN_FONT_SIZE), MAX_FONT_SIZE);
}

function readStored(): number {
  if (typeof localStorage === "undefined") return DEFAULT_FONT_SIZE;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return DEFAULT_FONT_SIZE;

  // 旧バージョンは "small" などの段階名を保存していた
  const legacy: Record<string, number> = {
    small: 13,
    normal: 13,
    medium: 15,
    large: 17,
    xlarge: 19,
  };
  if (raw in legacy) return legacy[raw];

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampFontSize(parsed) : DEFAULT_FONT_SIZE;
}

let current = readStored();
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

/** `:root` に反映する。CSS 側で派生サイズと行間が計算される。 */
export function applyFontSize(value: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--fs-base", `${value}px`);
}

export function useFontSize(): number {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

export function getFontSize(): number {
  return current;
}

export function setFontSize(value: number): number {
  current = clampFontSize(value);
  applyFontSize(current);
  try {
    localStorage.setItem(STORAGE_KEY, String(current));
  } catch {
    // プライベートモード等で保存できなくても動作は続ける
  }
  emit();
  return current;
}

/** 1px ずつ増減する。範囲外なら何もしない。 */
export function stepFontSize(delta: number): number {
  return setFontSize(current + delta);
}

export function canStepFontSize(delta: number): boolean {
  return clampFontSize(current + delta) !== current;
}

/** 起動時に保存値を適用する。 */
export function initFontSize(): void {
  applyFontSize(current);
}
