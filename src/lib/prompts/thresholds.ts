import { t } from "@/lib/i18n/i18n";

/**
 * AI の合否判定に使う可変閾値の **UI 用メタ情報**。
 *
 * 「成長株を探したい人」と「割安・高配当を探したい人」では合格ラインが違う。
 * 固定値をプロンプトに埋め込むと、どちらかにしか使えないアプリになる。
 *
 * **プロンプトへの文字列化は Rust 側（`src-tauri/src/prompts/mod.rs`）が行う。**
 * ここにあるのは入力欄を描くための情報（表示名・単位・範囲・刻み）だけで、
 * AI への指示文は含まない。
 *
 * 項目 ID と既定値は Rust 側と一致させること
 * （ずれると設定した値が反映されない。両側にテストを置いてある）。
 */

/** 判定の向き。`min` は「以上で合格」、`max` は「以下で合格」。 */
export type ThresholdDirection = "min" | "max";

export interface ThresholdDefinition {
  /** **内部キー。** Rust 側の閾値 ID と一致させる（表示名とは無関係） */
  id: string;
  /** 単位の辞書キー（`unit.percent` など） */
  unitKey: string;
  direction: ThresholdDirection;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

export const THRESHOLDS: ThresholdDefinition[] = [
  {
    id: "revenueGrowth",
    unitKey: "unit.percent",
    direction: "min",
    defaultValue: 15,
    min: -20,
    max: 100,
    step: 1,
  },
  {
    id: "operatingMargin",
    unitKey: "unit.percent",
    direction: "min",
    defaultValue: 15,
    min: -20,
    max: 60,
    step: 1,
  },
  {
    id: "roe",
    unitKey: "unit.percent",
    direction: "min",
    defaultValue: 15,
    min: 0,
    max: 60,
    step: 1,
  },
  {
    id: "cashRunwayMonths",
    unitKey: "unit.months",
    direction: "min",
    defaultValue: 24,
    min: 0,
    max: 60,
    step: 1,
  },
  {
    id: "fcfMargin",
    unitKey: "unit.percent",
    direction: "min",
    defaultValue: 10,
    min: -30,
    max: 60,
    step: 1,
  },
  {
    id: "per",
    unitKey: "unit.times",
    direction: "max",
    defaultValue: 30,
    min: 5,
    max: 120,
    step: 1,
  },
  {
    id: "pbr",
    unitKey: "unit.times",
    direction: "max",
    defaultValue: 5,
    min: 0.5,
    max: 30,
    step: 0.5,
  },
  {
    id: "debtToEquity",
    unitKey: "unit.times",
    direction: "max",
    defaultValue: 1.5,
    min: 0,
    max: 10,
    step: 0.1,
  },
  {
    id: "dividendYield",
    unitKey: "unit.percent",
    direction: "min",
    defaultValue: 0,
    min: 0,
    max: 15,
    step: 0.1,
  },
  {
    id: "payoutRatio",
    unitKey: "unit.percent",
    direction: "max",
    defaultValue: 70,
    min: 0,
    max: 150,
    step: 5,
  },
];

export type ThresholdValues = Record<string, number>;

/** 定義を ID で引く。 */
export function definitionOf(id: string): ThresholdDefinition | undefined {
  return THRESHOLDS.find((t) => t.id === id);
}

/** 範囲外の値を丸める。小数の刻みに合わせて桁も揃える。 */
export function clampThreshold(def: ThresholdDefinition, value: number): number {
  if (!Number.isFinite(value)) return def.defaultValue;
  const clamped = Math.min(Math.max(value, def.min), def.max);
  // step が 0.1 なら小数第 1 位まで、1 なら整数に丸める
  const decimals = def.step < 1 ? String(def.step).split(".")[1]?.length ?? 1 : 0;
  return Number(clamped.toFixed(decimals));
}

/**
 * 既定値に保存済みの値を重ねる。
 * 知らない ID と壊れた値は無視して、必ず全項目そろった状態を返す。
 */
export function mergeThresholds(stored: ThresholdValues | null | undefined): ThresholdValues {
  const merged: ThresholdValues = {};
  for (const def of THRESHOLDS) {
    merged[def.id] = def.defaultValue;
  }
  if (!stored) return merged;

  for (const [id, value] of Object.entries(stored)) {
    const def = definitionOf(id);
    if (!def) continue;
    if (typeof value !== "number") continue;
    merged[id] = clampThreshold(def, value);
  }
  return merged;
}

/** 既定から変更されている項目の ID。 */
export function customizedIds(values: ThresholdValues): string[] {
  return THRESHOLDS.filter((def) => values[def.id] !== def.defaultValue).map((d) => d.id);
}

/** 1 項目ぶんの判定条件を文にする（例: `売上高成長率（YoY） > 15%`）。 */
export function formatRule(def: ThresholdDefinition, value: number): string {
  const comparator = def.direction === "min" ? ">=" : "<=";
  return `${thresholdLabel(def)} ${comparator} ${value}${thresholdUnit(def)}`;
}

/** 表示名。**内部キーとは分離**しているので、訳を変えても保存値に影響しない。 */
export function thresholdLabel(def: ThresholdDefinition): string {
  return t(`threshold.${def.id}`);
}

/** 単位。 */
export function thresholdUnit(def: ThresholdDefinition): string {
  return t(def.unitKey);
}

/** 何を見る指標かの補足。 */
export function thresholdHint(def: ThresholdDefinition): string {
  return t(`threshold.${def.id}.hint`);
}
