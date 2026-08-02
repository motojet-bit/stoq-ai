import { t } from "@/lib/i18n/i18n";
import type { ArchiveEntry } from "@/types";
import { periodLabelOf } from "@/lib/portfolio/archive";
import { statusOf, type AnalysisStatus } from "@/lib/export/analysisRecord";

/**
 * 保有銘柄 × 四半期のヒートマップ。
 *
 * **列（四半期）は全銘柄の和集合で作る。** 銘柄ごとに分析した期が違うので、
 * 1 銘柄だけを見て列を決めると他の期が抜け落ちる。
 */

export interface HeatCell {
  /** 5 点満点の平均 */
  score: number | null;
  status: AnalysisStatus | null;
  statusIcon: string;
  /** その期の分析 ID（開くときに使う） */
  entryId: string | null;
  savedAtMs: number | null;
}

export interface HeatRow {
  ticker: string;
  cells: Record<string, HeatCell>;
  /** 直近の平均スコア */
  latestScore: number | null;
  /** 分析した期の数 */
  count: number;
}

export interface Heatmap {
  /** 列見出し（新しい期が左）。例: `FY26-Q3` */
  quarters: string[];
  rows: HeatRow[];
}

const EMPTY_CELL: HeatCell = {
  score: null,
  status: null,
  statusIcon: "",
  entryId: null,
  savedAtMs: null,
};

/** 表示用の四半期キー（`FY26-Q3` 形式）。 */
export function quarterKey(entry: ArchiveEntry): string {
  const label = periodLabelOf(entry);
  const match = label.match(/(\d{2,4})\s*[-/ ]?\s*Q([1-4])/i);
  if (!match) return label;
  const year = match[1].length >= 4 ? match[1].slice(-2) : match[1].padStart(2, "0");
  return `FY${year}-Q${match[2]}`;
}

/** 四半期キーを並べ替えるための数値（新しいほど大きい）。 */
export function quarterOrder(key: string): number {
  const match = key.match(/FY(\d{2})-Q([1-4])/);
  if (!match) return -1;
  return Number(match[1]) * 10 + Number(match[2]);
}

/**
 * 銘柄 × 四半期の表を作る。
 *
 * 同じ期に複数回分析していたら**最新の 1 件**を採る
 * （やり直した結果のほうが確度が高いため）。
 */
export function buildHeatmap(entries: ArchiveEntry[], tickers?: string[]): Heatmap {
  const wanted = tickers?.map((t) => t.trim().toUpperCase()) ?? null;
  const quarterSet = new Set<string>();
  const byTicker = new Map<string, Map<string, ArchiveEntry>>();

  for (const entry of entries) {
    const ticker = entry.ticker.trim().toUpperCase();
    if (ticker === "") continue;
    if (wanted && !wanted.includes(ticker)) continue;

    const key = quarterKey(entry);
    quarterSet.add(key);

    const cells = byTicker.get(ticker) ?? new Map<string, ArchiveEntry>();
    const existing = cells.get(key);
    // 同じ期に複数回あれば新しいほうを残す
    if (!existing || entry.savedAtMs > existing.savedAtMs) cells.set(key, entry);
    byTicker.set(ticker, cells);
  }

  const quarters = [...quarterSet].sort((a, b) => quarterOrder(b) - quarterOrder(a));

  // 行の並びは指定があればその順、無ければ直近が新しい順
  const tickerOrder =
    wanted ?? [...byTicker.keys()].sort((a, b) => latestAt(byTicker, b) - latestAt(byTicker, a));

  const rows: HeatRow[] = tickerOrder.map((ticker) => {
    const cells = byTicker.get(ticker) ?? new Map<string, ArchiveEntry>();
    const row: Record<string, HeatCell> = {};

    for (const quarter of quarters) {
      const entry = cells.get(quarter);
      if (!entry) {
        row[quarter] = EMPTY_CELL;
        continue;
      }
      const { status, statusIcon } = statusOf(entry.averageScore);
      row[quarter] = {
        score: entry.averageScore,
        status: entry.averageScore === null ? null : status,
        statusIcon: entry.averageScore === null ? "" : statusIcon,
        entryId: entry.id,
        savedAtMs: entry.savedAtMs,
      };
    }

    const latest = [...cells.values()].sort((a, b) => b.savedAtMs - a.savedAtMs)[0] ?? null;

    return {
      ticker,
      cells: row,
      latestScore: latest?.averageScore ?? null,
      count: cells.size,
    };
  });

  return { quarters, rows };
}

function latestAt(map: Map<string, Map<string, ArchiveEntry>>, ticker: string): number {
  const cells = map.get(ticker);
  if (!cells) return 0;
  return Math.max(...[...cells.values()].map((e) => e.savedAtMs), 0);
}

/**
 * 過去全期のデータを対話へ流し込むテキストにする。
 *
 * **AI が読みやすい構造化テキスト**にする。素の Markdown を並べると
 * どこからどこまでが 1 期か分からなくなるため、期ごとに見出しで区切る。
 */
export function buildTransferText(
  ticker: string,
  entries: { label: string; score: number | null; savedAtMs: number; body: string }[],
): string {
  if (entries.length === 0) {
    return t("archive.empty", { ticker });
  }

  const sections = entries
    .map((entry) =>
      [
        t("archive.entryHeading", {
          label: entry.label,
          score: entry.score === null ? "—" : entry.score.toFixed(1),
          date: new Date(entry.savedAtMs).toLocaleDateString(),
        }),
        "",
        entry.body,
      ].join("\n"),
    )
    .join("\n\n");

  /*
   * 囲みタグは AI が範囲を取り違えないための目印。
   * **訳さない。** 表示するものではなく、プロンプト内の構造を示す記号。
   */
  return `${t("archive.promptHeading", { ticker, count: entries.length })}

<archive ticker="${ticker}" periods="${entries.length}">

${sections}

</archive>

`;
}
