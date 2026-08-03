import { invoke, isTauri } from "@/lib/tauri";
import type { MarketQuote } from "@/types";

/**
 * 株価の軽量フィードを取る。
 *
 * **失敗を例外で返さない。** 株価は「あれば嬉しい」情報であって、
 * 取れなかったことで分析の操作が止まってはいけない。
 * 取れなければ null を返し、画面側はオフライン表示に切り替える。
 */
export async function fetchQuote(ticker: string): Promise<MarketQuote | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<MarketQuote>("market_quote", { ticker });
  } catch {
    return null;
  }
}
