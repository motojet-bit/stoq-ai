import type { ArchiveEntry } from "@/types";
import { parseAnalysisRecord } from "@/lib/export/analysisRecord";
import { quarterKey } from "@/lib/portfolio/heatmap";

/**
 * 指定した四半期のスコア・評価を、銘柄をまたいで横並びにする。
 *
 * ヒートマップは「銘柄 × 全期」の俯瞰なので、
 * **「この期だけを見比べたい」には向かない。**
 * 同じ期に絞れば、ブロック別スコアまで並べて比べられる。
 */

export interface QuarterRow {
  ticker: string;
  entryId: string;
  averageScore: number | null;
  statusIcon: string;
  /** ブロック別スコア（`blockId` → スコア） */
  blocks: Record<string, number | null>;
  savedAtMs: number;
}

export interface QuarterComparison {
  /** 比較対象の期（`FY26-Q3`） */
  quarter: string;
  /** 並べるブロックの見出し（全銘柄の和集合。出現順を保つ） */
  blockLabels: { id: string; label: string }[];
  rows: QuarterRow[];
}

/** 履歴に含まれる四半期を、新しい順で返す（選択肢に使う）。 */
export function availableQuarters(entries: ArchiveEntry[]): string[] {
  const keys = new Set<string>();
  for (const entry of entries) {
    // アドホック（期中の追加分析）は期の代表ではないので並べない
    if (entry.parentId !== null) continue;
    keys.add(quarterKey(entry));
  }
  return [...keys].sort((a, b) => order(b) - order(a));
}

function order(key: string): number {
  const m = key.match(/FY(\d{2,4})-Q([1-4])/);
  if (!m) return -1;
  const year = m[1].length >= 4 ? Number(m[1].slice(-2)) : Number(m[1]);
  return year * 10 + Number(m[2]);
}

/**
 * 指定した期の行を組み立てる。
 *
 * **同じ銘柄が同じ期に複数あれば、最新の 1 件を採る。**
 * やり直した結果のほうが確度が高い。
 */
export function buildQuarterComparison(
  entries: ArchiveEntry[],
  quarter: string,
): QuarterComparison {
  const byTicker = new Map<string, ArchiveEntry>();

  for (const entry of entries) {
    if (entry.parentId !== null) continue;
    if (quarterKey(entry) !== quarter) continue;
    const current = byTicker.get(entry.ticker);
    if (!current || entry.savedAtMs > current.savedAtMs) byTicker.set(entry.ticker, entry);
  }

  const labels: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  const rows: QuarterRow[] = [];

  for (const entry of byTicker.values()) {
    const record = parseAnalysisRecord(entry.record ?? "{}");
    const blocks: Record<string, number | null> = {};

    for (const block of record?.blockScores ?? []) {
      blocks[block.id] = block.score;
      if (!seen.has(block.id)) {
        seen.add(block.id);
        labels.push({ id: block.id, label: block.label });
      }
    }

    rows.push({
      ticker: entry.ticker,
      entryId: entry.id,
      averageScore: entry.averageScore,
      statusIcon: record?.summary.statusIcon ?? "",
      blocks,
      savedAtMs: entry.savedAtMs,
    });
  }

  // 平均スコアの高い順。取れていないものは末尾へ
  rows.sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1));

  return { quarter, blockLabels: labels, rows };
}
