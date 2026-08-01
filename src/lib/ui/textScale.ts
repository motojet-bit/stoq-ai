import { useSyncExternalStore } from "react";

/**
 * 分析結果の文字サイズ。長文を読む画面なので、ユーザーが調整できるようにする。
 * 選択は localStorage に保存し、再起動後も維持する。
 */
export type TextScale = "small" | "normal" | "large";

const STORAGE_KEY = "stockanalyzer.textScale";
const ORDER: TextScale[] = ["small", "normal", "large"];

/** サイズごとの Tailwind クラス。行間も一緒に変える。 */
export const SCALE_CLASSES: Record<
  TextScale,
  { body: string; label: string; heading: string; mono: string; leading: string }
> = {
  small: {
    body: "text-[12px]",
    label: "text-[11px]",
    heading: "text-[11.5px]",
    mono: "text-[11.5px]",
    leading: "leading-[1.75]",
  },
  normal: {
    body: "text-[13px]",
    label: "text-[12px]",
    heading: "text-[12px]",
    mono: "text-[12.5px]",
    leading: "leading-[1.85]",
  },
  large: {
    body: "text-[15px]",
    label: "text-[13px]",
    heading: "text-[13px]",
    mono: "text-[14px]",
    leading: "leading-[1.95]",
  },
};

function readStored(): TextScale {
  if (typeof localStorage === "undefined") return "normal";
  const value = localStorage.getItem(STORAGE_KEY);
  return ORDER.includes(value as TextScale) ? (value as TextScale) : "normal";
}

let current: TextScale = readStored();
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

export function useTextScale(): TextScale {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

export function setTextScale(scale: TextScale): void {
  current = scale;
  try {
    localStorage.setItem(STORAGE_KEY, scale);
  } catch {
    // プライベートモード等で保存できなくても動作は続ける
  }
  emit();
}

/** 1 段階大きく / 小さくする。端に達したら何もしない。 */
export function stepTextScale(delta: 1 | -1): void {
  const index = ORDER.indexOf(current);
  const next = ORDER[Math.min(Math.max(index + delta, 0), ORDER.length - 1)];
  if (next !== current) setTextScale(next);
}

export function canStep(delta: 1 | -1): boolean {
  const index = ORDER.indexOf(current);
  return index + delta >= 0 && index + delta < ORDER.length;
}
