import { t } from "@/lib/i18n/i18n";

/**
 * 20項目のファンダメンタル評価軸の**見出しだけ**。
 *
 * **AI への指示文（何をどう見るか）は Rust 側の `src-tauri/src/prompts/core.md`
 * にあり、ビルド時にバイナリへ埋め込まれる。** ここに残しているのは
 * 結果テーブルの描画と行のパースに必要な「番号・分類・項目名」だけで、
 * 分析ノウハウは含まれない。
 *
 * 項目の順序と `id`、`label` は Rust 側の一覧と一致していること。
 */

/**
 * 分類の**内部キー**。表示名は辞書（`criterion.cat.*`）から引く。
 * **この値は保存データにも入る**ので、英語 ID のまま変えないこと。
 */
export type CriterionCategory =
  | "business"
  | "growth"
  | "profitability"
  | "financial"
  | "management"
  | "risk"
  | "overall";

export interface Criterion {
  /** 1 始まりの通し番号。**プロンプトと結果テーブルの対応づけに使う内部キー** */
  id: number;
  /** 分類の内部キー */
  category: CriterionCategory;
}

export const CRITERIA: Criterion[] = [
  {
    id: 1,
    category: "business",
  },
  {
    id: 2,
    category: "business",
  },
  {
    id: 3,
    category: "growth",
  },
  {
    id: 4,
    category: "growth",
  },
  {
    id: 5,
    category: "profitability",
  },
  {
    id: 6,
    category: "profitability",
  },
  {
    id: 7,
    category: "profitability",
  },
  {
    id: 8,
    category: "financial",
  },
  {
    id: 9,
    category: "financial",
  },
  {
    id: 10,
    category: "financial",
  },
  {
    id: 11,
    category: "management",
  },
  {
    id: 12,
    category: "management",
  },
  {
    id: 13,
    category: "management",
  },
  {
    id: 14,
    category: "business",
  },
  {
    id: 15,
    category: "risk",
  },
  {
    id: 16,
    category: "risk",
  },
  {
    id: 17,
    category: "risk",
  },
  {
    id: 18,
    category: "overall",
  },
  {
    id: 19,
    category: "overall",
  },
  {
    id: 20,
    category: "overall",
  },
];

export function criterionById(id: number): Criterion | undefined {
  return CRITERIA.find((c) => c.id === id);
}

/**
 * 表示名を引く。**内部キー（`id`）とは完全に分離**しているので、
 * 訳を変えても保存データや AI 出力の突き合わせには影響しない。
 */
export function criterionLabel(id: number): string {
  return t(`criterion.${id}`);
}

/** 分類の表示名。 */
export function categoryLabel(category: CriterionCategory): string {
  return t(`criterion.cat.${category}`);
}
