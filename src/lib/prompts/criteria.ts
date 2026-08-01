/**
 * 20項目のファンダメンタル評価基準。
 *
 * **このファイルだけを差し替えれば評価軸を変更できる。**
 * 項目の順序と `id` は分析結果テーブルのパースに使われるため、
 * 変更したら `parseAnalysis.ts` の想定行数（= この配列の長さ）も自動で追従する。
 */

export type CriterionCategory = "事業" | "成長" | "収益性" | "財務" | "経営" | "リスク" | "総合";

export interface Criterion {
  /** 1 始まりの通し番号。プロンプトと結果テーブルで対応づける */
  id: number;
  category: CriterionCategory;
  label: string;
  /** LLM に何を見るべきか伝えるための補足 */
  hint: string;
}

export const CRITERIA: Criterion[] = [
  {
    id: 1,
    category: "事業",
    label: "事業モデルの明瞭さ",
    hint: "収益がどこから生まれるかを一文で説明できるか。収益源の分散度。",
  },
  {
    id: 2,
    category: "事業",
    label: "競争優位（モート）",
    hint: "ネットワーク効果・スイッチングコスト・規模の経済・ブランド・特許のいずれが効いているか。",
  },
  {
    id: 3,
    category: "成長",
    label: "TAM と成長余地",
    hint: "市場規模に対する現在のシェアと、未浸透領域の大きさ。",
  },
  {
    id: 4,
    category: "成長",
    label: "売上成長の持続性",
    hint: "成長が一過性か構造的か。価格・数量・新規顧客のどれが牽引しているか。",
  },
  {
    id: 5,
    category: "収益性",
    label: "粗利率の水準と推移",
    hint: "同業比較での位置と、直近数期のトレンド。",
  },
  {
    id: 6,
    category: "収益性",
    label: "営業レバレッジ",
    hint: "売上増に対して営業利益がより速く伸びているか。固定費構造。",
  },
  {
    id: 7,
    category: "収益性",
    label: "フリーキャッシュフロー創出力",
    hint: "純利益と FCF の乖離。運転資本の増減。",
  },
  {
    id: 8,
    category: "財務",
    label: "バランスシートの健全性",
    hint: "純有利子負債、流動比率、満期構造。金利上昇への耐性。",
  },
  {
    id: 9,
    category: "財務",
    label: "ROIC / ROE の質",
    hint: "レバレッジによる嵩上げか、本業の収益力か。",
  },
  {
    id: 10,
    category: "財務",
    label: "設備投資の効率",
    hint: "投下資本あたりの売上・利益の伸び。減価償却との比率。",
  },
  {
    id: 11,
    category: "経営",
    label: "資本配分の巧拙",
    hint: "自社株買い・配当・M&A・再投資の配分と、その過去実績。",
  },
  {
    id: 12,
    category: "経営",
    label: "経営陣の質・実行力",
    hint: "過去の宣言と実績の一致度。在任期間。インセンティブ設計。",
  },
  {
    id: 13,
    category: "経営",
    label: "ガイダンスの信頼性",
    hint: "過去のガイダンス達成率。前提の保守性。",
  },
  {
    id: 14,
    category: "事業",
    label: "セグメント別トレンド",
    hint: "伸びている事業と縮んでいる事業。ミックス変化が利益率に与える影響。",
  },
  {
    id: 15,
    category: "リスク",
    label: "顧客・取引先の集中リスク",
    hint: "上位顧客の売上比率。特定サプライヤーへの依存。",
  },
  {
    id: 16,
    category: "リスク",
    label: "規制・訴訟リスク",
    hint: "係属中の訴訟、規制当局の動き、地政学的な制約。",
  },
  {
    id: 17,
    category: "リスク",
    label: "景気感応度",
    hint: "循環株か否か。景気後退局面での過去の業績。",
  },
  {
    id: 18,
    category: "総合",
    label: "バリュエーションの妥当性",
    hint: "PER / PBR / PSR / EV·EBITDA を成長率と収益性に照らして評価。",
  },
  {
    id: 19,
    category: "総合",
    label: "短期カタリスト",
    hint: "今後 6〜12 か月で株価を動かしうる具体的イベント。",
  },
  {
    id: 20,
    category: "総合",
    label: "総合投資判断",
    hint: "上記を統合した結論。強気・中立・弱気とその理由。",
  },
];

/** 評価スコアの意味。プロンプトに埋め込む。 */
export const SCORE_SCALE = [
  { score: 5, label: "非常に良好", note: "明確な強み。同業比較でも上位。" },
  { score: 4, label: "良好", note: "平均を上回る。" },
  { score: 3, label: "中立", note: "平均的、または判断材料が拮抗。" },
  { score: 2, label: "懸念", note: "平均を下回る。注視が必要。" },
  { score: 1, label: "重大な懸念", note: "投資判断を左右する弱点。" },
  { score: 0, label: "判定不能", note: "提供された資料からは判断できない。" },
] as const;

export function criterionById(id: number): Criterion | undefined {
  return CRITERIA.find((c) => c.id === id);
}
