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
    id: "cashRunwayMonths",
    label: "キャッシュランウェイ",
    unit: "か月",
    direction: "min",
    defaultValue: 24,
    min: 0,
    max: 60,
    step: 1,
    hint: "手元現金でバーンレートを何か月まかなえるか。赤字先行の中小型株で重要",
  },
  {
    id: "fcfMargin",
    label: "FCF マージン",
    unit: "%",
    direction: "min",
    defaultValue: 10,
    min: -30,
    max: 60,
    step: 1,
    hint: "フリーCF ÷ 売上高。会計上の利益より現金の創出力を見る",
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
  {
    id: "payoutRatio",
    label: "配当性向",
    unit: "%",
    direction: "max",
    defaultValue: 70,
    min: 0,
    max: 150,
    step: 5,
    hint: "利益に対する配当の割合。高いほど減配余地が小さい",
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
