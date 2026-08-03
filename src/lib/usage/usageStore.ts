import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import { t } from "@/lib/i18n/i18n";
import type { UsageLogEntry, UsageStatus } from "@/lib/usage/usageLog";

/**
 * 実行ログのストア。
 *
 * 実体は Rust 側（`analyses.db` の `usage_log`）にあり、ここはキャッシュ。
 */
let entries: UsageLogEntry[] = [];
let loading = false;
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

export function useUsageLog(): UsageLogEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
}

export function useUsageLoading(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loading,
    () => loading,
  );
}

export async function loadUsageLog(): Promise<void> {
  if (!isTauri()) return;
  loading = true;
  emit();
  try {
    entries = await invoke<UsageLogEntry[]>("usage_log_list");
  } catch (e) {
    toastError(t("usageLog.loadFailed"), e);
  } finally {
    loading = false;
    emit();
  }
}

/**
 * 1 件を記録する。
 *
 * **失敗しても分析は止めない。** ログが残らないのは困るが、
 * ここで throw すると、終わった分析の保存まで巻き添えになる。
 */
export async function appendUsageLog(input: {
  ticker: string;
  provider: string | null;
  model: string | null;
  roleId: string | null;
  inputTokens: number;
  outputTokens: number;
  status: UsageStatus;
  startedAtMs: number;
}): Promise<void> {
  if (!isTauri()) return;
  // 何も消費していない実行は記録しない（一覧が 0 行で埋まる）
  if (input.inputTokens + input.outputTokens === 0) return;

  try {
    await invoke("usage_log_append", input);
  } catch {
    // 記録できなくても分析の結果は残す
  }
}

/** ログを全消しする。**分析結果には触れない。** */
export async function clearUsageLog(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("usage_log_clear");
    entries = [];
    emit();
    toastSuccess(t("usageLog.cleared"), "");
    return true;
  } catch (e) {
    toastError(t("usageLog.clearFailed"), e);
    return false;
  }
}
