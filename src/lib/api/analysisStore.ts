import { useSyncExternalStore } from "react";
import { fetchFundamentals } from "@/lib/api/yahoo";
import { fetchFilingStatus } from "@/lib/api/sec";
import { invoke, isTauri } from "@/lib/tauri";
import { pushToast, toastError } from "@/lib/ui/toastStore";
import type { QuarterlySeries, TickerAnalysis } from "@/types";
import { t } from "@/lib/i18n/i18n";

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
    quarterlyLoading: false,
    quarterly: null,
    quarterlyError: null,
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
    quarterlyLoading: true,
    quarterlyError: null,
  });

  await Promise.all([
    loadFundamentals(ticker),
    loadFiling(ticker),
    loadQuarterly(ticker),
  ]);
}

async function loadQuarterly(ticker: string): Promise<void> {
  if (!isTauri()) {
    patch(ticker, { quarterlyLoading: false });
    return;
  }
  try {
    const quarterly = await invoke<QuarterlySeries>("quarterly_series", { ticker });
    patch(ticker, { quarterly, quarterlyLoading: false, quarterlyError: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    patch(ticker, { quarterlyLoading: false, quarterlyError: message });
    // 四半期推移は補助情報なので、失敗してもトーストは出さない
  }
}

async function loadFundamentals(ticker: string): Promise<void> {
  try {
    const fundamentals = await fetchFundamentals(ticker);
    patch(ticker, { fundamentals, fundamentalsLoading: false, fundamentalsError: null });

    if (fundamentals.warning) {
      pushToast("warning", t("toast.analysis.partialMetrics", { ticker }), fundamentals.warning);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    patch(ticker, { fundamentalsLoading: false, fundamentalsError: message });
    toastError(t("toast.analysis.priceFailed", { ticker }), e);
  }
}

async function loadFiling(ticker: string): Promise<void> {
  try {
    const filing = await fetchFilingStatus(ticker);
    patch(ticker, { filing, filingLoading: false, filingError: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    patch(ticker, { filingLoading: false, filingError: message });
    toastError(t("toast.analysis.secStatusFailed", { ticker }), e);
  }
}
