import { useSyncExternalStore } from "react";

/**
 * アプリ全体の文字サイズ。長文を読む画面なので、ユーザーが調整できるようにする。
 * 市場データ・分析結果・対話のすべてが同じ設定を参照する。
 * 選択は localStorage に保存し、再起動後も維持する。
 */
export type TextScale = "small" | "medium" | "large" | "xlarge";

const STORAGE_KEY = "stockanalyzer.textScale";
const ORDER: TextScale[] = ["small", "medium", "large", "xlarge"];

/** 段階ごとの表示名（ツールチップ用） */
export const SCALE_LABELS: Record<TextScale, string> = {
  small: "小 (13px)",
  medium: "中 (15px)",
  large: "大 (17px)",
  xlarge: "特大 (19px)",
};

/** サイズごとの Tailwind クラス。行間も一緒に変える。 */
export const SCALE_CLASSES: Record<
  TextScale,
  { body: string; label: string; heading: string; mono: string; leading: string }
> = {
  small: {
    body: "text-[13px]",
    label: "text-[12px]",
    heading: "text-[12px]",
    mono: "text-[12.5px]",
    leading: "leading-[1.8]",
  },
  medium: {
    body: "text-[15px]",
    label: "text-[13px]",
    heading: "text-[13px]",
    mono: "text-[14px]",
    leading: "leading-[1.85]",
  },
  large: {
    body: "text-[17px]",
    label: "text-[14.5px]",
    heading: "text-[14.5px]",
    mono: "text-[15.5px]",
    leading: "leading-[1.9]",
  },
  xlarge: {
    body: "text-[19px]",
    label: "text-[16px]",
    heading: "text-[16px]",
    mono: "text-[17px]",
    leading: "leading-[1.95]",
  },
};

/** 旧バージョンの保存値を新しい段階へ読み替える。 */
function migrate(value: string | null): TextScale | null {
  switch (value) {
    case "small":
    case "medium":
    case "large":
    case "xlarge":
      return value;
    // 旧: small=12px / normal=13px / large=15px
    case "normal":
      return "small"; // 13px → 新 small(13px)
    default:
      return null;
  }
}

function readStored(): TextScale {
  if (typeof localStorage === "undefined") return "small";
  return migrate(localStorage.getItem(STORAGE_KEY)) ?? "small";
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
