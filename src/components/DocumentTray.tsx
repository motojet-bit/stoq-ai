import { useState } from "react";
import type { StagedDocument } from "@/types";
import {
  clearDocuments,
  deleteDocument,
  renameDocument,
  totalTokens,
  useIngestingFiles,
  useStagedDocuments,
} from "@/lib/parser/documentStore";
import StagedFileChip from "@/components/StagedFileChip";
import TokenMeter from "@/components/TokenMeter";
import DocumentPreviewModal from "@/components/DocumentPreviewModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  /** LLM 入力上限（設定の maxPromptTokens） */
  tokenLimit: number;
}

/**
 * 一時保存中の資料（Staged Files）のトレイ。
 * ドロップゾーンの直下に置き、状況が常に見えるようにする。
 */
export default function DocumentTray({ tokenLimit }: Props) {
  const t = useT();
  const documents = useStagedDocuments();
  const ingesting = useIngestingFiles();
  const [preview, setPreview] = useState<StagedDocument | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  if (documents.length === 0 && ingesting.length === 0) return null;

  return (
    <>
      <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/40 px-3 py-1.5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="t-label font-medium uppercase tracking-wider text-slate-500">
            {t("tray.title")}
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono t-label text-slate-400">
            {documents.length}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          {documents.map((doc) => (
            <StagedFileChip
              key={doc.id}
              doc={doc}
              onPreview={() => setPreview(doc)}
              onRename={(name) => void renameDocument(doc.id, name)}
              onDelete={() => void deleteDocument(doc.id)}
            />
          ))}

          {ingesting.map((job) => (
            <div
              key={job.id}
              className="flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 t-label text-slate-400"
            >
              <span className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-emerald-500" />
              <span className="max-w-40 truncate">{job.name}</span>
              <span className="t-label text-slate-600">
                {job.phase === "extracting" ? t("tray.extracting") : t("tray.saving")}
              </span>
            </div>
          ))}
        </div>

        <TokenMeter tokens={totalTokens(documents)} limit={tokenLimit} />

        {documents.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="min-h-7 shrink-0 rounded-md border border-slate-700 px-2.5 t-label text-slate-400 transition-colors hover:border-red-800 hover:text-red-300"
          >
            {t("tray.clearAll")}
          </button>
        )}
      </div>

      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />

      {/* 一時保存資料は AI に渡すコンテキストそのものなので、消す前に必ず確認する */}
      <ConfirmDialog
        open={confirmingClear}
        title={t("tray.clearTitle")}
        message={
          t("tray.clearBody", {
            count: documents.length,
            tokens: totalTokens(documents).toLocaleString(),
          })
        }
        confirmLabel={t("tray.clearConfirm")}
        cancelLabel={t("common.back")}
        destructive
        onConfirm={() => {
          setConfirmingClear(false);
          void clearDocuments();
        }}
        onCancel={() => setConfirmingClear(false)}
      />
    </>
  );
}
