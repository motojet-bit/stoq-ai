import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import type { AppSettings, TrialStatus } from "@/types";
import { getLicense, useLicense } from "@/lib/license/licenseStore";
import {
  evaluateAccess,
  registerTicker,
  type AccessResult,
} from "@/lib/license/freeTier";
import { t } from "@/lib/i18n/i18n";

/**
 * 無料版の使用状況。
 *
 * **保存先は Rust 側の設定ファイル。** localStorage に置くと
 * ブラウザデータの消去で制限が外れてしまう。
 */
let usedTickers: string[] = [];

/**
 * 体験期間の状態。**起点は Rust が持つ**
 * （初回起動時に設定ファイルへ焼き付ける）。
 * 未確認のうちは期限切れ扱いにしない（読み込み中に止めない）。
 */
let trial: TrialStatus | null = null;

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

export function getTrial(): TrialStatus | null {
  return trial;
}

export function useTrial(): TrialStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => trial,
    () => trial,
  );
}

/** 設定を読み込んだときに同期する。 */
export function syncFromSettings(settings: AppSettings | null): void {
  const next = settings?.freeTickers ?? [];
  const nextTrial = settings?.trial ?? null;
  const sameTickers =
    next.length === usedTickers.length && next.every((t, i) => t === usedTickers[i]);
  const sameTrial =
    trial?.expiresAtMs === nextTrial?.expiresAtMs &&
    trial?.expired === nextTrial?.expired &&
    trial?.remainingDays === nextTrial?.remainingDays;

  // 内容が同じなら再描画を起こさない
  if (sameTickers && sameTrial) return;

  usedTickers = next;
  if (nextTrial) trial = nextTrial;
  emit();
}

/** その銘柄を分析してよいか。ライセンスが有効なら常に許可。 */
export function checkAccess(ticker: string): AccessResult {
  return evaluateAccess({
    activated: getLicense().activated,
    usedTickers,
    ticker,
    trialExpired: trial?.expired ?? false,
  });
}

/**
 * 画面から使う判定。銘柄・体験期間・ライセンスの
 * **どれが変わっても再描画される**。
 */
export function useAccess(ticker: string | null): AccessResult {
  useSyncExternalStore(
    subscribe,
    () => usedTickers,
    () => usedTickers,
  );
  const license = useLicense();

  return evaluateAccess({
    activated: license.activated,
    usedTickers,
    ticker: ticker ?? "",
    trialExpired: trial?.expired ?? false,
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
    toastError(t("toast.freeTier.saveFailed"), e);
  }
}

/** テスト用。 */
export function resetFreeTier(): void {
  usedTickers = [];
  trial = null;
  emit();
}
