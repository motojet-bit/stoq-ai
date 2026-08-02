import { useSyncExternalStore } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { extractText } from "@/lib/parser/extractText";
import { pushToast, toastError } from "@/lib/ui/toastStore";
import type { IngestingFile, StagedDocument } from "@/types";
import { t } from "@/lib/i18n/i18n";

/**
 * 一時保存（ステージング）中の資料のストア。
 *
 * 実体は Rust 側の `<app_data_dir>/temp_documents/` にあり、ここはそのキャッシュ。
 * テキスト抽出はフロント（WebView）で行い、抽出結果だけを Rust へ渡す。
 */
let documents: StagedDocument[] = [];
let ingesting: IngestingFile[] = [];

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

export function useStagedDocuments(): StagedDocument[] {
  return useSyncExternalStore(
    subscribe,
    () => documents,
    () => documents,
  );
}

export function useIngestingFiles(): IngestingFile[] {
  return useSyncExternalStore(
    subscribe,
    () => ingesting,
    () => ingesting,
  );
}

function commit(next: StagedDocument[]) {
  documents = next;
  emit();
}

function setIngesting(next: IngestingFile[]) {
  ingesting = next;
  emit();
}

/** 起動時に一時保存フォルダの内容を読み込む。 */
export async function loadStagedDocuments(): Promise<void> {
  if (!isTauri()) return;
  try {
    commit(await invoke<StagedDocument[]>("documents_list"));
  } catch (e) {
    toastError(t("toast.docs.loadFailed"), e);
  }
}

/**
 * ファイルを取り込む。抽出 → 保存を 1 件ずつ順に行う。
 *
 * 1 件失敗しても残りの取り込みは続ける。
 */
export async function ingestFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;

  if (!isTauri()) {
    pushToast(
      "warning",
      t("toast.docs.browserOnly"),
      t("toast.docs.browserHint"),
    );
    return;
  }

  let succeeded = 0;

  for (const file of files) {
    const jobId = crypto.randomUUID();
    setIngesting([...ingesting, { id: jobId, name: file.name, phase: "extracting" }]);

    try {
      const text = await extractText(file);

      setIngesting(ingesting.map((j) => (j.id === jobId ? { ...j, phase: "saving" } : j)));

      const staged = await invoke<StagedDocument>("documents_stage", {
        originalName: file.name,
        sizeBytes: file.size,
        text,
      });
      commit([...documents, staged]);
      succeeded += 1;
    } catch (e) {
      toastError(t("toast.docs.ingestFailed", { name: file.name }), e);
    } finally {
      setIngesting(ingesting.filter((j) => j.id !== jobId));
    }
  }

  if (succeeded > 0) {
    pushToast("success", t("toast.docs.staged", { count: succeeded }));
  }
}

export async function renameDocument(id: string, displayName: string): Promise<void> {
  try {
    commit(await invoke<StagedDocument[]>("documents_rename", { id, displayName }));
  } catch (e) {
    toastError(t("toast.docs.renameFailed"), e);
  }
}

export async function deleteDocument(id: string): Promise<void> {
  try {
    commit(await invoke<StagedDocument[]>("documents_delete", { id }));
  } catch (e) {
    toastError(t("toast.docs.deleteFailed"), e);
  }
}

export async function clearDocuments(): Promise<void> {
  try {
    commit(await invoke<StagedDocument[]>("documents_clear"));
    pushToast("info", t("toast.docs.cleared"));
  } catch (e) {
    toastError(t("toast.docs.clearFailed"), e);
  }
}

/** プレビュー用に本文を読み出す。 */
export async function readDocumentText(id: string): Promise<string> {
  return invoke<string>("documents_read_text", { id });
}

/** 一時保存中の資料の合計トークン数。 */
export function totalTokens(docs: StagedDocument[]): number {
  return docs.reduce((sum, d) => sum + d.tokenEstimate, 0);
}
