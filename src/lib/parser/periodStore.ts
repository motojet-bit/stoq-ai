import { periodKey, type FiscalPeriod } from "@/lib/parser/fiscalPeriod";

/**
 * ユーザーが確認・確定した決算期。
 *
 * **銘柄ごとに 1 件だけ持ち、メモリに置く。**
 * 資料を入れ替えれば期も変わるので、永続化すると古い確定が残って
 * 次の分析に効いてしまう。分析のたびに聞き直すほうが安全。
 */

export interface ConfirmedPeriod {
  fiscalYear: number;
  quarter: 1 | 2 | 3 | 4 | null;
  /** `FY2023-Q3` 形式 */
  key: string;
  /** 自動特定の結果を人が直したか */
  corrected: boolean;
}

const confirmed = new Map<string, ConfirmedPeriod>();

const normalize = (ticker: string) => ticker.trim().toUpperCase();

export function getConfirmedPeriod(ticker: string): ConfirmedPeriod | null {
  return confirmed.get(normalize(ticker)) ?? null;
}

/**
 * 確定した期を記録する。
 *
 * `detected` を渡すと、自動特定の結果と食い違うかどうかを `corrected` に残す。
 * 直した頻度が高ければ、判定の書式を足す手がかりになる。
 */
export function setConfirmedPeriod(
  ticker: string,
  fiscalYear: number,
  quarter: 1 | 2 | 3 | 4 | null,
  detected: FiscalPeriod | null,
): ConfirmedPeriod {
  const entry: ConfirmedPeriod = {
    fiscalYear,
    quarter,
    key: periodKey(fiscalYear, quarter),
    corrected:
      detected !== null && (detected.fiscalYear !== fiscalYear || detected.quarter !== quarter),
  };
  confirmed.set(normalize(ticker), entry);
  return entry;
}

/** 資料を入れ替えたときなどに捨てる。 */
export function clearConfirmedPeriod(ticker: string): void {
  confirmed.delete(normalize(ticker));
}

/** テスト用。全消し。 */
export function resetConfirmedPeriods(): void {
  confirmed.clear();
}
