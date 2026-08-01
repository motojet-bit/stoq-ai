import type { Fundamentals, Metric, QuarterlySeries, SavedAnalysis } from "@/types";
import { parseAnalysis } from "@/lib/prompts/parseAnalysis";

/**
 * 複数銘柄を横並びで比べるためのデータ整形。
 *
 * **UI に依存しない純粋な変換にしてある。** 指標の拾い方や
 * スコアのまとめ方は投資判断に直結するので、テストで固定したい。
 */

/** 同時に比べられる上限。これ以上は横に並べても読めない。 */
export const MAX_COMPARE = 5;

export interface CompareSource {
  ticker: string;
  fundamentals: Fundamentals | null;
  quarterly: QuarterlySeries | null;
  /** SQLite に保存済みの分析結果。未分析なら null */
  analysis: SavedAnalysis | null;
}

export interface CompareCell {
  /** 表示文字列。取れなければ "—" */
  display: string;
  /** 並べ替え・強調に使う生値 */
  raw: number | null;
}

export interface ScoreBlock {
  id: string;
  label: string;
  /** 0〜5。対象項目が 1 つも無ければ null */
  score: number | null;
}

export interface CompareColumn {
  ticker: string;
  name: string;
  /** 分析結果があるか */
  analyzed: boolean;
  /** 未分析のときの案内文 */
  notice: string | null;
  savedAtMs: number | null;
  metrics: Record<string, CompareCell>;
  blocks: ScoreBlock[];
  averageScore: number | null;
}

export interface ComparisonView {
  columns: CompareColumn[];
  /** 未分析の銘柄の案内（画面上部にまとめて出す） */
  notices: string[];
}

/** サマリー比較テーブルの行。上から重要な順。 */
export const COMPARE_METRICS = [
  { key: "price", label: "株価" },
  { key: "marketCap", label: "時価総額" },
  { key: "revenueGrowth", label: "売上成長率（YoY）" },
  { key: "grossMargin", label: "粗利率" },
  { key: "operatingMargin", label: "営業利益率" },
  { key: "roe", label: "ROE" },
  { key: "cashRunway", label: "Cash Runway" },
  { key: "evGrossProfit", label: "EV / 粗利" },
  { key: "per", label: "PER（実績）" },
  { key: "debtToEquity", label: "負債比率 (D/E)" },
] as const;

/**
 * 20項目のスコアを 5 ブロックにまとめる対応表。
 *
 * **20項目すべてをどれかに割り当てる。** 一部を捨てると
 * 「評価したのに比較に出てこない」項目が生まれて混乱するため。
 */
export const SCORE_BLOCKS: { id: string; label: string; criteria: number[] }[] = [
  { id: "growth", label: "成長性", criteria: [3, 4, 14, 19] },
  { id: "solvency", label: "財務生存性", criteria: [7, 8, 10, 17] },
  { id: "profitability", label: "経済性", criteria: [5, 6, 9] },
  { id: "moat", label: "競争優位性", criteria: [1, 2, 12, 13, 15, 16] },
  { id: "valuation", label: "バリュエーション", criteria: [11, 18, 20] },
];

const EMPTY: CompareCell = { display: "—", raw: null };

/** 全グループを横断してラベル一致の指標を引く。 */
function findMetric(fundamentals: Fundamentals | null, label: string): Metric | null {
  if (!fundamentals) return null;
  for (const group of fundamentals.groups) {
    const hit = group.metrics.find((m) => m.label === label);
    if (hit) return hit;
  }
  return null;
}

function cell(metric: Metric | null): CompareCell {
  if (!metric || metric.raw === null) return EMPTY;
  return { display: metric.value, raw: metric.raw };
}

/**
 * Cash Runway（残存月数）を出す。
 *
 * 手元現金 ÷ 月間バーンレート。**営業CF が黒字なら「バーンしていない」**ので、
 * 月数ではなくその旨を返す（0 か月と誤読されないように）。
 */
export function cashRunway(fundamentals: Fundamentals | null): CompareCell {
  const cash = findMetric(fundamentals, "現金・同等物")?.raw ?? null;
  const operatingCf = findMetric(fundamentals, "営業CF")?.raw ?? null;
  if (cash === null || operatingCf === null) return EMPTY;
  if (operatingCf >= 0) return { display: "営業CF黒字", raw: null };

  const monthlyBurn = Math.abs(operatingCf) / 12;
  if (monthlyBurn === 0) return EMPTY;

  const months = cash / monthlyBurn;
  return { display: `${months.toFixed(1)} か月`, raw: months };
}

/**
 * EV / 粗利（EV/Gross Profit）を出す。
 *
 * 粗利の質が違う事業を PER だけで比べないための指標。
 * `EV / 売上高` と `粗利率` から導出する（粗利そのものは返ってこないため）。
 */
export function evPerGrossProfit(fundamentals: Fundamentals | null): CompareCell {
  const evToSales = findMetric(fundamentals, "EV / 売上高")?.raw ?? null;
  const grossMarginPct = findMetric(fundamentals, "粗利率")?.raw ?? null;
  if (evToSales === null || grossMarginPct === null || grossMarginPct <= 0) return EMPTY;

  const value = evToSales / (grossMarginPct / 100);
  return { display: `${value.toFixed(1)} 倍`, raw: value };
}

/** 売上成長率。四半期の YoY があればそちらを優先する（より新しいため）。 */
export function revenueGrowth(
  fundamentals: Fundamentals | null,
  quarterly: QuarterlySeries | null,
): CompareCell {
  const yoy = quarterly?.momentum.latestYoy ?? null;
  if (yoy !== null) return { display: `${yoy.toFixed(1)}%`, raw: yoy };
  return cell(findMetric(fundamentals, "売上成長率（YoY）"));
}

function buildMetrics(source: CompareSource): Record<string, CompareCell> {
  const { fundamentals, quarterly } = source;

  return {
    price: fundamentals
      ? { display: fundamentals.priceDisplay, raw: fundamentals.price }
      : EMPTY,
    marketCap: cell(findMetric(fundamentals, "時価総額")),
    revenueGrowth: revenueGrowth(fundamentals, quarterly),
    grossMargin: cell(findMetric(fundamentals, "粗利率")),
    operatingMargin: cell(findMetric(fundamentals, "営業利益率")),
    roe: cell(findMetric(fundamentals, "ROE")),
    cashRunway: cashRunway(fundamentals),
    evGrossProfit: evPerGrossProfit(fundamentals),
    per: cell(findMetric(fundamentals, "PER（実績）")),
    debtToEquity: cell(findMetric(fundamentals, "負債比率 (D/E)")),
  };
}

/**
 * 20項目のスコアを 5 ブロックの平均にする。
 *
 * **スコア 0（判定不能）は平均から除く。** 資料不足を「悪い」と読ませないため。
 */
export function buildBlocks(scores: Map<number, number>): ScoreBlock[] {
  return SCORE_BLOCKS.map((block) => {
    const values = block.criteria
      .map((id) => scores.get(id))
      .filter((v): v is number => typeof v === "number" && v > 0);

    return {
      id: block.id,
      label: block.label,
      score:
        values.length === 0
          ? null
          : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)),
    };
  });
}

function emptyBlocks(): ScoreBlock[] {
  return SCORE_BLOCKS.map((b) => ({ id: b.id, label: b.label, score: null }));
}

/** 1 銘柄ぶんの列を組み立てる。 */
export function buildColumn(source: CompareSource): CompareColumn {
  const name = source.fundamentals?.name || source.ticker;

  if (!source.analysis) {
    return {
      ticker: source.ticker,
      name,
      analyzed: false,
      notice: `${name} の分析データが未作成です。先に単体分析を実行してください`,
      savedAtMs: null,
      metrics: buildMetrics(source),
      blocks: emptyBlocks(),
      averageScore: null,
    };
  }

  const parsed = parseAnalysis(source.analysis.raw);
  const scores = new Map<number, number>();
  for (const row of parsed.rows) {
    // スコアを読み取れなかった行は集計に入れない
    if (row.score !== null) scores.set(row.id, row.score);
  }

  return {
    ticker: source.ticker,
    name,
    analyzed: true,
    notice: null,
    savedAtMs: source.analysis.savedAtMs,
    metrics: buildMetrics(source),
    blocks: buildBlocks(scores),
    averageScore: parsed.averageScore,
  };
}

/** 選択された銘柄をまとめて比較用に整える。 */
export function buildComparison(sources: CompareSource[]): ComparisonView {
  const columns = sources.slice(0, MAX_COMPARE).map(buildColumn);
  return {
    columns,
    notices: columns
      .map((c) => c.notice)
      .filter((n): n is string => n !== null),
  };
}

/**
 * その行でいちばん良い値の銘柄を返す（強調表示用）。
 *
 * 指標によって「高いほど良い」「低いほど良い」が違うので、向きを指定する。
 * 同点や比較できる値が 1 つ以下のときは強調しない。
 */
const LOWER_IS_BETTER = new Set(["per", "debtToEquity", "evGrossProfit"]);

export function bestTickerFor(columns: CompareColumn[], key: string): string | null {
  const values = columns
    .map((c) => ({ ticker: c.ticker, raw: c.metrics[key]?.raw ?? null }))
    .filter((v): v is { ticker: string; raw: number } => v.raw !== null);

  if (values.length < 2) return null;

  const lower = LOWER_IS_BETTER.has(key);
  const best = values.reduce((a, b) => {
    if (a.raw === b.raw) return a;
    return (lower ? b.raw < a.raw : b.raw > a.raw) ? b : a;
  });

  // 全部同じ値なら誰も「いちばん」ではない
  if (values.every((v) => v.raw === best.raw)) return null;
  return best.ticker;
}
