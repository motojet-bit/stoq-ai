/**
 * AI の合否判定に使う可変閾値。
 *
 * 「成長株を探したい人」と「割安・高配当を探したい人」では合格ラインが違う。
 * 固定値をプロンプトに埋め込むと、どちらかにしか使えないアプリになる。
 *
 * 定義（項目・既定値・範囲）は**ここが唯一の出所**で、
 * Rust 側には「ユーザーが変えた値」だけを保存する。
 * 既定値を両方に置くと、既定を変えたときに古い値が残ってしまう。
 */

/** 判定の向き。`min` は「以上で合格」、`max` は「以下で合格」。 */
export type ThresholdDirection = "min" | "max";

export interface ThresholdDefinition {
  id: string;
  label: string;
  /** 単位（`%` `倍` など） */
  unit: string;
  direction: ThresholdDirection;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  /** 何を見る指標かの補足 */
  hint: string;
}

export const THRESHOLDS: ThresholdDefinition[] = [
  {
    id: "revenueGrowth",
    label: "売上高成長率（YoY）",
    unit: "%",
    direction: "min",
    defaultValue: 15,
    min: -20,
    max: 100,
    step: 1,
    hint: "直近四半期の前年同期比。成長株を探すなら高め、安定株なら低めに",
  },
  {
    id: "operatingMargin",
    label: "営業利益率",
    unit: "%",
    direction: "min",
    defaultValue: 15,
    min: -20,
    max: 60,
    step: 1,
    hint: "本業の稼ぐ力。業種によって水準が大きく違う",
  },
  {
    id: "roe",
    label: "ROE（自己資本利益率）",
    unit: "%",
    direction: "min",
    defaultValue: 15,
    min: 0,
    max: 60,
    step: 1,
    hint: "株主資本をどれだけ効率よく利益に変えているか",
  },
  {
    id: "per",
    label: "PER（株価収益率）",
    unit: "倍",
    direction: "max",
    defaultValue: 30,
    min: 5,
    max: 120,
    step: 1,
    hint: "割高さの目安。成長率とセットで見る",
  },
  {
    id: "pbr",
    label: "PBR（株価純資産倍率）",
    unit: "倍",
    direction: "max",
    defaultValue: 5,
    min: 0.5,
    max: 30,
    step: 0.5,
    hint: "資産面からの割高さ。資産の軽い業種では高くなりやすい",
  },
  {
    id: "debtToEquity",
    label: "D/E（負債資本倍率）",
    unit: "倍",
    direction: "max",
    defaultValue: 1.5,
    min: 0,
    max: 10,
    step: 0.1,
    hint: "財務の安全性。高いほど借入依存",
  },
  {
    id: "dividendYield",
    label: "配当利回り",
    unit: "%",
    direction: "min",
    defaultValue: 0,
    min: 0,
    max: 15,
    step: 0.1,
    hint: "インカム重視なら引き上げる。0 のままなら判定に使わない",
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
  return `${def.label} ${comparator} ${value}${def.unit}`;
}

/**
 * システムプロンプトに差し込む閾値ルールを組み立てる。
 *
 * **合否だけでなく「判定できない場合」の扱いまで書く。**
 * 指標が取れないときに勝手に不合格にされると、資料不足と実力不足の
 * 区別がつかなくなるため。
 */
export function buildThresholdSection(values: ThresholdValues): string {
  const merged = mergeThresholds(values);
  const lines = THRESHOLDS.map((def) => `- ${formatRule(def, merged[def.id])}`).join("\n");

  return `# 閾値基準（ユーザー設定・厳密に適用すること）

以下の閾値基準を厳密に適用して合格/不合格を判定せよ。

${lines}

- 各項目の根拠欄には、**該当する閾値に対して合格か不合格かを必ず明記する**
  （例: 「売上成長率 +16.4%（基準 ${merged.revenueGrowth}% 以上 → 合格）」）。
- 数値が取得できず判定できない場合は「基準未判定（データなし）」と書く。
  **取得できないことを不合格として扱わない。**
- 閾値はユーザーの投資方針であり、絶対的な優劣ではない。
  基準を外れていても、それを補う材料があれば根拠欄でその旨を述べる。`;
}
