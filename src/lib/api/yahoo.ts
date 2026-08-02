import { invoke, isTauri } from "@/lib/tauri";
import type { Fundamentals } from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * Yahoo Finance から主要指標を取得する。
 *
 * 実際の HTTP は Rust 側が行う（CORS 回避と Cookie/crumb の保持のため）。
 */
export async function fetchFundamentals(ticker: string): Promise<Fundamentals> {
  if (!isTauri()) {
    throw new Error(
      t("err.browserYahoo"),
    );
  }
  return invoke<Fundamentals>("yahoo_fetch_fundamentals", { ticker });
}
