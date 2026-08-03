import { estimateCost, type CostEstimate } from "@/lib/llm/cost";

/**
 * 分析の実行ログ。
 *
 * **結果とは別に持つ。** 分析結果を消してもコストの記録は残したいし、
 * 中断・エラーで終わった実行も残す（消費は発生している）。
 */

/** 実行の終わり方。 */
export type UsageStatus = "done" | "cancelled" | "error";

export interface UsageLogEntry {
  id: string;
  ticker: string;
  provider: string | null;
  model: string | null;
  /** 使った役割プロファイルの ID */
  roleId: string | null;
  inputTokens: number;
  outputTokens: number;
  status: UsageStatus;
  startedAtMs: number;
  savedAtMs: number;
}

export interface UsageTotals {
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usd: number;
  jpy: number;
  /**
   * 単価が分からず金額に反映できなかった件数。
   * **黙って 0 円として足さない**（実際より安く見える）。
   */
  unpricedCount: number;
}

/** 1 件ぶんのコスト。単価不明なら 0 とフラグ。 */
export function costOf(entry: UsageLogEntry, usdJpy?: number): CostEstimate {
  return estimateCost({
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    model: entry.model,
    usdJpy,
  });
}

/** 累計。**中断・エラーぶんも足す**（実際に払っているため）。 */
export function totalUsage(entries: UsageLogEntry[], usdJpy?: number): UsageTotals {
  const totals: UsageTotals = {
    count: entries.length,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    usd: 0,
    jpy: 0,
    unpricedCount: 0,
  };

  for (const entry of entries) {
    totals.inputTokens += entry.inputTokens;
    totals.outputTokens += entry.outputTokens;
    const cost = costOf(entry, usdJpy);
    if (cost.unknownModel) {
      // トークンは数えるが、金額には入れない
      if (entry.inputTokens + entry.outputTokens > 0) totals.unpricedCount += 1;
    } else {
      totals.usd += cost.usd;
      totals.jpy += cost.jpy;
    }
  }

  totals.totalTokens = totals.inputTokens + totals.outputTokens;
  return totals;
}

/** CSV の 1 セル。カンマ・改行・引用符が入っても崩れないようにする。 */
function cell(value: string | number): string {
  const text = String(value);
  const quote = String.fromCharCode(34);
  // カンマ・改行・引用符のいずれかを含むときだけ包む
  const needsQuote =
    text.includes(",") ||
    text.includes(quote) ||
    text.includes(String.fromCharCode(10)) ||
    text.includes(String.fromCharCode(13));
  if (!needsQuote) return text;
  // 引用符は 2 つ重ねて打ち消す（CSV の決まり）
  return quote + text.split(quote).join(quote + quote) + quote;
}

/**
 * ログを CSV にする。
 *
 * **金額も入れる。** 経費として控える人がいるので、
 * トークン数だけ渡しても使えない。
 */
export function toUsageCsv(entries: UsageLogEntry[], header: string[], usdJpy?: number): string {
  const rows = entries.map((entry) => {
    const cost = costOf(entry, usdJpy);
    return [
      new Date(entry.savedAtMs).toLocaleString(),
      entry.ticker,
      entry.provider ?? "",
      entry.model ?? "",
      entry.roleId ?? "",
      entry.inputTokens,
      entry.outputTokens,
      entry.inputTokens + entry.outputTokens,
      cost.unknownModel ? "" : cost.usd.toFixed(4),
      cost.unknownModel ? "" : Math.round(cost.jpy),
      entry.status,
    ]
      .map(cell)
      .join(",");
  });

  return [header.map(cell).join(","), ...rows].join("\n");
}
