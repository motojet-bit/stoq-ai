import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import type { AppSettings } from "@/types";
import { getLicense } from "@/lib/license/licenseStore";
import {
  evaluateAccess,
  registerTicker,
  type AccessResult,
} from "@/lib/license/freeTier";

/**
 * 無料版の使用状況。
 *
 * **保存先は Rust 側の設定ファイル。** localStorage に置くと
 * ブラウザデータの消去で制限が外れてしまう。
 */
let usedTickers: string[] = [];

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

/** 購読を外から張れるようにする（React の外・テスト用）。 */
export const subscribeFreeTier = subscribe;

export function useUsedTickers(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => usedTickers,
    () => usedTickers,
  );
}

export function getUsedTickers(): string[] {
  return usedTickers;
}

/** 設定を読み込んだときに同期する。 */
export function syncFromSettings(settings: AppSettings | null): void {
  const next = settings?.freeTickers ?? [];
  // 内容が同じなら再描画を起こさない
  if (next.length === usedTickers.length && next.every((t, i) => t === usedTickers[i])) {
    return;
  }
  usedTickers = next;
  emit();
}

/** その銘柄を分析してよいか。ライセンスが有効なら常に許可。 */
export function checkAccess(ticker: string): AccessResult {
  return evaluateAccess({
    activated: getLicense().activated,
    usedTickers,
    ticker,
  });
}

/**
 * 使用済みに登録する。
 * ライセンスが有効なときは数えない（無制限なので記録する意味がない）。
 */
export async function useTicker(ticker: string): Promise<void> {
  if (getLicense().activated) return;

  const next = registerTicker(usedTickers, ticker);
  if (next.length === usedTickers.length) return;

  usedTickers = next;
  emit();

  if (!isTauri()) return;
  try {
    await invoke<AppSettings>("free_tier_set", { tickers: next });
  } catch (e) {
    toastError("利用状況を保存できませんでした", e);
  }
}

/** テスト用。 */
export function resetFreeTier(): void {
  usedTickers = [];
  emit();
}
