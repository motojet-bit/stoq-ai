import type { Fundamentals, QuarterlySeries } from "@/types";
import { parseAnalysis } from "@/lib/prompts/parseAnalysis";
import {
  cashRunway,
  evPerGrossProfit,
  revenueGrowth,
  SCORE_BLOCKS,
} from "@/lib/compare/compareData";

/**
 * 分析結果の標準フォーマット。
 *
 * **保存・エクスポート・他ツール連携で同じ形を使う。**
 * 画面ごとに組み立て直すと、CSV と JSON で数字が食い違う事故が起きる。
 * 生成テキスト（`rawMarkdownOutput`）も必ず一緒に持ち、
 * 構造化に失敗しても原文だけは失わないようにする。
 */

/** 総合ステータス。信号の色で直感的に示す */
export type AnalysisStatus = "green" | "yellow" | "red";

export interface AnalysisSummary {
  /** 100 点満点に換算した総合スコア */
  totalScore: number | null;
  status: AnalysisStatus;
  /** 🟢 / 🟡 / 🔴 */
  statusIcon: string;
  statusLabel: string;
  /** 20項目の平均（5 点満点） */
  averageScore: number | null;
  /** スコアを読み取れた項目数 */
  scoredCount: number;
}

export interface BlockScore {
  id: string;
  label: string;
  /** 5 点満点 */
  score: number | null;
}

export interface KeyMetric {
  key: string;
  label: string;
  value: string;
  raw: number | null;
}

export interface AnalysisEvaluations {
  /** 適合・強み（最大 5 点） */
  strengths: string[];
  /** 基準未達・リスク（最大 5 点） */
  risks: string[];
}

export interface AnalysisRecord {
  /** 保存フォーマットの版。読み込み側の分岐に使う */
  version: 1;
  ticker: string;
  companyName: string;
  /** 決算期（例: `FY26-Q3`） */
  fiscalQuarter: string;
  summary: AnalysisSummary;
  blockScores: BlockScore[];
  keyMetrics: KeyMetric[];
  evaluations: AnalysisEvaluations;
  rawMarkdownOutput: string;
  provider: string | null;
  model: string | null;
  savedAtMs: number;
}

/** 強み・リスクは 5 点まで。多すぎると比較に使えない */
export const MAX_EVALUATIONS = 5;

/**
 * 決算期ラベルを `FY26-Q3` の形にそろえる。
 *
 * Yahoo から来る `2026Q3` `FY2026 Q3` などの表記ゆれを吸収し、
 * 取れなければ保存日時から組み立てる。
 */
export function fiscalQuarterOf(label: string | null, savedAtMs: number): string {
  const source = (label ?? "").trim();
  const match = source.match(/(\d{2,4})\s*[-/ ]?\s*Q([1-4])/i);

  if (match) {
    const year = match[1].length >= 4 ? match[1].slice(-2) : match[1].padStart(2, "0");
    return `FY${year}-Q${match[2]}`;
  }

  const date = new Date(savedAtMs);
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `FY${String(date.getFullYear()).slice(-2)}-Q${quarter}`;
}

/**
 * 総合ステータスを決める。
 *
 * **0（判定不能）を除いた平均**で判定する。資料不足を「悪い」と読ませないため。
 */
export function statusOf(averageScore: number | null): {
  status: AnalysisStatus;
  statusIcon: string;
  statusLabel: string;
} {
  if (averageScore === null) {
    return { status: "red", statusIcon: "🔴", statusLabel: "判定不能" };
  }
  if (averageScore >= 4) {
    return { status: "green", statusIcon: "🟢", statusLabel: "良好" };
  }
  if (averageScore >= 3) {
    return { status: "yellow", statusIcon: "🟡", statusLabel: "中立" };
  }
  return { status: "red", statusIcon: "🔴", statusLabel: "懸念" };
}

/** 5 点満点の平均を 100 点満点へ換算する。 */
export function toHundred(averageScore: number | null): number | null {
  if (averageScore === null) return null;
  return Math.round((averageScore / 5) * 100);
}

export interface RecordSource {
  ticker: string;
  raw: string;
  fundamentals: Fundamentals | null;
  quarterly: QuarterlySeries | null;
  provider: string | null;
  model: string | null;
  savedAtMs: number;
}

function metric(
  fundamentals: Fundamentals | null,
  key: string,
  label: string,
  sourceLabel: string,
): KeyMetric {
  for (const group of fundamentals?.groups ?? []) {
    const hit = group.metrics.find((m) => m.label === sourceLabel);
    if (hit) return { key, label, value: hit.value, raw: hit.raw };
  }
  return { key, label, value: "—", raw: null };
}

/**
 * 希薄化率（発行済株式数の増加）。
 *
 * 1 時点のスナップショットしか無いので**現時点では算出できない**。
 * 枠だけ用意し、値は「—」にしておく（列が消えると CSV の形が変わるため）。
 */
function dilutionMetric(): KeyMetric {
  return { key: "dilution", label: "希薄化率", value: "—", raw: null };
}

/** 分析結果を標準フォーマットに組み立てる。 */
export function buildAnalysisRecord(source: RecordSource): AnalysisRecord {
  const parsed = parseAnalysis(source.raw);
  const scores = new Map<number, number>();
  for (const row of parsed.rows) {
    if (row.score !== null) scores.set(row.id, row.score);
  }

  const scored = [...scores.values()].filter((v) => v > 0);
  const average =
    scored.length === 0
      ? null
      : Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(2));

  const growth = revenueGrowth(source.fundamentals, source.quarterly);

  return {
    version: 1,
    ticker: source.ticker.trim().toUpperCase(),
    companyName: source.fundamentals?.name ?? "",
    fiscalQuarter: fiscalQuarterOf(
      source.quarterly?.quarters.at(-1)?.label ?? null,
      source.savedAtMs,
    ),
    summary: {
      totalScore: toHundred(average),
      averageScore: average,
      scoredCount: scored.length,
      ...statusOf(average),
    },
    blockScores: SCORE_BLOCKS.map((block) => {
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
    }),
    keyMetrics: [
      {
        key: "price",
        label: "株価",
        value: source.fundamentals?.priceDisplay ?? "—",
        raw: source.fundamentals?.price ?? null,
      },
      metric(source.fundamentals, "marketCap", "時価総額", "時価総額"),
      { key: "revenueGrowth", label: "売上成長率（YoY）", value: growth.display, raw: growth.raw },
      cashRunwayMetric(source.fundamentals),
      metric(source.fundamentals, "grossMargin", "粗利率", "粗利率"),
      dilutionMetric(),
      evGrossProfitMetric(source.fundamentals),
      metric(source.fundamentals, "per", "PER（実績）", "PER（実績）"),
      metric(source.fundamentals, "roe", "ROE", "ROE"),
      metric(source.fundamentals, "debtToEquity", "負債比率 (D/E)", "負債比率 (D/E)"),
    ],
    evaluations: {
      strengths: parsed.strengths.slice(0, MAX_EVALUATIONS),
      risks: parsed.risks.slice(0, MAX_EVALUATIONS),
    },
    rawMarkdownOutput: source.raw,
    provider: source.provider,
    model: source.model,
    savedAtMs: source.savedAtMs,
  };
}

/** 比較用の `{display, raw}` を `{value, raw}` の指標に写す。 */
function cashRunwayMetric(fundamentals: Fundamentals | null): KeyMetric {
  const cell = cashRunway(fundamentals);
  return { key: "cashRunway", label: "Cash Runway", value: cell.display, raw: cell.raw };
}

function evGrossProfitMetric(fundamentals: Fundamentals | null): KeyMetric {
  const cell = evPerGrossProfit(fundamentals);
  return { key: "evGrossProfit", label: "EV / 粗利", value: cell.display, raw: cell.raw };
}

/**
 * 保存された JSON を読み戻す。
 *
 * **壊れていても例外を投げない。** 1 件の破損で一覧全体が出なくなるより、
 * その行だけ落とすほうがましなため。
 */
export function parseAnalysisRecord(json: string): AnalysisRecord | null {
  try {
    const value = JSON.parse(json) as Partial<AnalysisRecord>;
    if (typeof value !== "object" || value === null) return null;
    if (typeof value.ticker !== "string" || value.ticker === "") return null;
    if (typeof value.rawMarkdownOutput !== "string") return null;

    return {
      version: 1,
      ticker: value.ticker,
      companyName: value.companyName ?? "",
      fiscalQuarter: value.fiscalQuarter ?? "",
      summary: value.summary ?? {
        totalScore: null,
        status: "red",
        statusIcon: "🔴",
        statusLabel: "判定不能",
        averageScore: null,
        scoredCount: 0,
      },
      blockScores: Array.isArray(value.blockScores) ? value.blockScores : [],
      keyMetrics: Array.isArray(value.keyMetrics) ? value.keyMetrics : [],
      evaluations: {
        strengths: value.evaluations?.strengths ?? [],
        risks: value.evaluations?.risks ?? [],
      },
      rawMarkdownOutput: value.rawMarkdownOutput,
      provider: value.provider ?? null,
      model: value.model ?? null,
      savedAtMs: value.savedAtMs ?? 0,
    };
  } catch {
    return null;
  }
}

/** 保存用の JSON 文字列にする。 */
export function serializeAnalysisRecord(record: AnalysisRecord): string {
  return JSON.stringify(record);
}
