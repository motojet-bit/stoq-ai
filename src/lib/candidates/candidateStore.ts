import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import type { CandidateStock } from "@/types";
import type { ParsedCandidate } from "@/lib/candidates/parseCandidates";
import { t } from "@/lib/i18n/i18n";

/**
 * 検討中銘柄のストア。実体は Rust 側の SQLite（`library.db`）。
 * 一覧は毎回 Rust から返る最新のものに差し替える。
 */
let candidates: CandidateStock[] = [];
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

export function useCandidates(): CandidateStock[] {
  return useSyncExternalStore(
    subscribe,
    () => candidates,
    () => candidates,
  );
}

export function useCandidatesLoading(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loading,
    () => loading,
  );
}

/** いまの一覧。React の外（テストなど）から読むときに使う。 */
export function getCandidates(): CandidateStock[] {
  return candidates;
}

function replace(next: CandidateStock[]) {
  candidates = next;
  emit();
}

export async function loadCandidates(): Promise<void> {
  if (!isTauri()) return;
  loading = true;
  emit();
  try {
    replace(await invoke<CandidateStock[]>("candidates_list"));
  } catch (e) {
    toastError(t("toast.candidates.loadFailed"), e);
  } finally {
    loading = false;
    emit();
  }
}

/** パース済みの行をまとめて登録する。既存のティッカーは上書きされる。 */
export async function addCandidates(items: ParsedCandidate[]): Promise<void> {
  if (items.length === 0) return;
  try {
    replace(await invoke<CandidateStock[]>("candidates_add", { items }));
  } catch (e) {
    toastError(t("toast.candidates.saveFailed"), e);
    throw e;
  }
}

/** 1 件削除する（✕ ボタン / 右クリックメニュー）。 */
export async function removeCandidate(id: string): Promise<void> {
  try {
    replace(await invoke<CandidateStock[]>("candidates_remove", { id }));
  } catch (e) {
    toastError(t("toast.candidates.removeFailed"), e);
  }
}

export async function clearCandidates(): Promise<void> {
  try {
    replace(await invoke<CandidateStock[]>("candidates_clear"));
  } catch (e) {
    toastError(t("toast.candidates.removeFailed"), e);
  }
}
