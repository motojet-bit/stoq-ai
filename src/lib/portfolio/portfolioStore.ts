import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { toastError } from "@/lib/ui/toastStore";
import type { ArchiveEntry, Portfolio } from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * ポートフォリオ（銘柄リスト）と分析アーカイブのストア。
 * 実体は Rust 側の SQLite（`library.db` / `analyses.db`）。
 */
let portfolios: Portfolio[] = [];
let archive: ArchiveEntry[] = [];
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

export function usePortfolios(): Portfolio[] {
  return useSyncExternalStore(
    subscribe,
    () => portfolios,
    () => portfolios,
  );
}

export function useArchive(): ArchiveEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => archive,
    () => archive,
  );
}

export function useArchiveLoading(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loading,
    () => loading,
  );
}

export function getPortfolios(): Portfolio[] {
  return portfolios;
}

export function getArchive(): ArchiveEntry[] {
  return archive;
}

function replace(next: Portfolio[]) {
  portfolios = next;
  emit();
}

export async function loadPortfolios(): Promise<void> {
  if (!isTauri()) return;
  try {
    replace(await invoke<Portfolio[]>("portfolios_list"));
  } catch (e) {
    toastError(t("toast.portfolio.loadFailed"), e);
  }
}

/** 分析アーカイブ（実行履歴）を読み直す。 */
export async function loadArchive(): Promise<void> {
  if (!isTauri()) return;
  loading = true;
  emit();
  try {
    archive = await invoke<ArchiveEntry[]>("analysis_history", { ticker: null });
  } catch (e) {
    toastError(t("toast.portfolio.archiveFailed"), e);
  } finally {
    loading = false;
    emit();
  }
}

/**
 * 分析履歴を 1 件消す。
 *
 * **消えたことを画面へ即座に反映する。** 再読み込みを待つと、
 * 消したはずの行が数百 ms 残り、押し損ねたと思って二度押しされる。
 * 削除に失敗したときは読み直して元の一覧へ戻す。
 */
export async function removeArchiveEntry(id: string): Promise<boolean> {
  if (!isTauri()) return false;
  const before = archive;
  archive = archive.filter((entry) => entry.id !== id);
  emit();
  try {
    await invoke("analysis_history_delete", { id });
    return true;
  } catch (e) {
    archive = before;
    emit();
    toastError(t("toast.portfolio.historyDeleteFailed"), e);
    return false;
  }
}

export async function createPortfolio(name?: string): Promise<void> {
  try {
    replace(await invoke<Portfolio[]>("portfolios_create", { name: name ?? null }));
  } catch (e) {
    toastError(t("toast.portfolio.createFailed"), e);
  }
}

export async function renamePortfolio(id: string, name: string): Promise<void> {
  try {
    replace(await invoke<Portfolio[]>("portfolios_rename", { id, name }));
  } catch (e) {
    toastError(t("toast.portfolio.renameFailed"), e);
  }
}

export async function removePortfolio(id: string): Promise<void> {
  try {
    replace(await invoke<Portfolio[]>("portfolios_remove", { id }));
  } catch (e) {
    toastError(t("toast.portfolio.deleteFailed"), e);
  }
}

export async function addTickerToPortfolio(id: string, ticker: string): Promise<void> {
  try {
    replace(await invoke<Portfolio[]>("portfolios_add_ticker", { id, ticker }));
  } catch (e) {
    toastError(t("toast.portfolio.addFailed"), e);
  }
}

export async function removeTickerFromPortfolio(
  id: string,
  ticker: string,
): Promise<void> {
  try {
    replace(await invoke<Portfolio[]>("portfolios_remove_ticker", { id, ticker }));
  } catch (e) {
    toastError(t("toast.portfolio.removeFailed"), e);
  }
}
