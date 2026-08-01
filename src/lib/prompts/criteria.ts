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

export type CriterionCategory = "事業" | "成長" | "収益性" | "財務" | "経営" | "リスク" | "総合";

export interface Criterion {
  /** 1 始まりの通し番号。プロンプトと結果テーブルで対応づける */
  id: number;
  category: CriterionCategory;
  label: string;
}

export const CRITERIA: Criterion[] = [
  {
    id: 1,
    category: "事業",
    label: "事業モデルの明瞭さ",
  },
  {
    id: 2,
    category: "事業",
    label: "競争優位（モート）",
  },
  {
    id: 3,
    category: "成長",
    label: "TAM と成長余地",
  },
  {
    id: 4,
    category: "成長",
    label: "売上成長のモメンタム",
  },
  {
    id: 5,
    category: "収益性",
    label: "粗利率の水準と推移",
  },
  {
    id: 6,
    category: "収益性",
    label: "営業レバレッジ・利益率の推移",
  },
  {
    id: 7,
    category: "収益性",
    label: "フリーキャッシュフロー創出力",
  },
  {
    id: 8,
    category: "財務",
    label: "バランスシートの健全性",
  },
  {
    id: 9,
    category: "財務",
    label: "ROIC / ROE の質",
  },
  {
    id: 10,
    category: "財務",
    label: "設備投資の効率",
  },
  {
    id: 11,
    category: "経営",
    label: "資本配分の巧拙",
  },
  {
    id: 12,
    category: "経営",
    label: "経営陣の質・実行力",
  },
  {
    id: 13,
    category: "経営",
    label: "ガイダンスの信頼性",
  },
  {
    id: 14,
    category: "事業",
    label: "セグメント別トレンド",
  },
  {
    id: 15,
    category: "リスク",
    label: "顧客・取引先の集中リスク",
  },
  {
    id: 16,
    category: "リスク",
    label: "規制・訴訟リスク",
  },
  {
    id: 17,
    category: "リスク",
    label: "景気感応度",
  },
  {
    id: 18,
    category: "総合",
    label: "バリュエーションの妥当性",
  },
  {
    id: 19,
    category: "総合",
    label: "短期カタリスト",
  },
  {
    id: 20,
    category: "総合",
    label: "総合投資判断",
  },
];

export function criterionById(id: number): Criterion | undefined {
  return CRITERIA.find((c) => c.id === id);
}
