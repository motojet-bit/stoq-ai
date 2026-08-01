import type { ArchiveEntry } from "@/types";

/**
 * 分析アーカイブ（実行履歴）の整形。
 *
 * `analyses` は銘柄ごとの最新 1 件しか持たないため、
 * **決算期をまたいだ推移は `analysis_history` の積み上げから作る。**
 * UI に依存しない純粋な変換にしてテストで固定する。
 */

export interface TickerArchive {
  ticker: string;
  /** 新しい順の実行履歴 */
  entries: ArchiveEntry[];
  /** 直近の実行日時 */
  latestAtMs: number;
  /** 直近の平均スコア（取れなければ null） */
  latestScore: number | null;
  /** 直近と 1 つ前の差。比較対象が無ければ null */
  scoreDelta: number | null;
}

/** 保存日時から会計四半期のラベルを作る（例: `FY2026 Q3`）。 */
export function periodLabelOf(entry: ArchiveEntry): string {
  if (entry.periodLabel && entry.periodLabel.trim() !== "") return entry.periodLabel;

  const date = new Date(entry.savedAtMs);
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `FY${date.getFullYear()} Q${quarter}`;
}

/**
 * 銘柄ごとにまとめる。
 *
 * 並びは**直近の実行が新しい銘柄から**。
 * 久しぶりに見直す銘柄より、いま追っている銘柄を上に出したいため。
 */
export function groupByTicker(entries: ArchiveEntry[]): TickerArchive[] {
  const byTicker = new Map<string, ArchiveEntry[]>();

  for (const entry of entries) {
    const key = entry.ticker.trim().toUpperCase();
    if (key === "") continue;
    const list = byTicker.get(key) ?? [];
    list.push(entry);
    byTicker.set(key, list);
  }

  const archives: TickerArchive[] = [];
  for (const [ticker, list] of byTicker) {
    const sorted = [...list].sort((a, b) => b.savedAtMs - a.savedAtMs);
    const latest = sorted[0];
    const previous = sorted[1] ?? null;

    archives.push({
      ticker,
      entries: sorted,
      latestAtMs: latest.savedAtMs,
      latestScore: latest.averageScore,
      scoreDelta:
        latest.averageScore !== null && previous?.averageScore != null
          ? Number((latest.averageScore - previous.averageScore).toFixed(1))
          : null,
    });
  }

  return archives.sort((a, b) => b.latestAtMs - a.latestAtMs);
}

/** 指定した銘柄だけに絞る（ポートフォリオの中身を出すとき）。 */
export function archivesFor(
  archives: TickerArchive[],
  tickers: string[],
): TickerArchive[] {
  const wanted = tickers.map((t) => t.trim().toUpperCase());
  const found = new Map(archives.map((a) => [a.ticker, a]));

  // **リストの並び順を保つ。** 分析済みかどうかで順番が変わると探しづらい
  return wanted.map(
    (ticker) =>
      found.get(ticker) ?? {
        ticker,
        entries: [],
        latestAtMs: 0,
        latestScore: null,
        scoreDelta: null,
      },
  );
}

/** スコアの変化を矢印で表す。 */
export function deltaLabel(delta: number | null): string {
  if (delta === null || delta === 0) return "";
  return delta > 0 ? `▲ +${delta.toFixed(1)}` : `▼ ${delta.toFixed(1)}`;
}
