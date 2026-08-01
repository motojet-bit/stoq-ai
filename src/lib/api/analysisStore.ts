import { useSyncExternalStore } from "react";
import { fetchFundamentals } from "@/lib/api/yahoo";
import { fetchFilingStatus } from "@/lib/api/sec";
import { pushToast, toastError } from "@/lib/ui/toastStore";
import type { TickerAnalysis } from "@/types";

/**
 * ティッカーごとの取得結果を保持するストア。
 *
 * Yahoo と SEC は独立に走らせ、片方が失敗しても他方の表示を止めない。
 */
let entries: Record<string, TickerAnalysis> = {};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAnalyses(): Record<string, TickerAnalysis> {
  return useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
}

function patch(ticker: string, changes: Partial<TickerAnalysis>) {
  const current = entries[ticker] ?? blank(ticker);
  entries = { ...entries, [ticker]: { ...current, ...changes } };
  emit();
}

function blank(ticker: string): TickerAnalysis {
  return {
    ticker,
    fundamentalsLoading: false,
    fundamentals: null,
    fundamentalsError: null,
    filingLoading: false,
    filing: null,
    filingError: null,
  };
}

/**
 * 指定ティッカーの財務データと提出状況を取得する。
 * 2 つのリクエストは並行して走らせる。
 */
export async function loadTicker(rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) return;

  patch(ticker, {
    fundamentalsLoading: true,
    fundamentalsError: null,
    filingLoading: true,
    filingError: null,
  });

  await Promise.all([loadFundamentals(ticker), loadFiling(ticker)]);
}

async function loadFundamentals(ticker: string): Promise<void> {
  try {
    const fundamentals = await fetchFundamentals(ticker);
    patch(ticker, { fundamentals, fundamentalsLoading: false, fundamentalsError: null });

    if (fundamentals.warning) {
      pushToast("warning", `${ticker}: 指標を一部取得できませんでした`, fundamentals.warning);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    patch(ticker, { fundamentalsLoading: false, fundamentalsError: message });
    toastError(`${ticker} の株価データを取得できませんでした`, e);
  }
}

async function loadFiling(ticker: string): Promise<void> {
  try {
    const filing = await fetchFilingStatus(ticker);
    patch(ticker, { filing, filingLoading: false, filingError: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    patch(ticker, { filingLoading: false, filingError: message });
    toastError(`${ticker} の SEC 提出状況を確認できませんでした`, e);
  }
}
