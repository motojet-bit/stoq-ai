import { useEffect, useState } from "react";
import type { StagedDocument } from "@/types";
import { readDocumentText } from "@/lib/parser/documentStore";
import { invoke } from "@/lib/tauri";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import { IconFile } from "@/components/Icons";
import ModalShell from "@/components/ModalShell";
import { t as tr } from "@/lib/i18n/i18n";

interface Props {
  doc: StagedDocument | null;
  onClose: () => void;
}

/** 一時保存中の資料の抽出テキストをプレビューする。 */
export default function DocumentPreviewModal({ doc, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * 抽出したテキストを書き出す。
   *
   * **元のバイナリではなく抽出テキストを保存する。** プレビューで見えているものと
   * 同じものが手元に残るほうが、あとから照合できる。
   */
  const download = async () => {
    if (!doc || text === null) return;
    setSaving(true);
    try {
      const path = await invoke<string>("export_write_file", {
        fileName: `${doc.displayName.replace(/[\/:*?"<>|]/g, "_")}.txt`,
        contents: text,
      });
      toastSuccess(tr("doc.downloaded"), path);
    } catch (e) {
      toastError(tr("doc.downloadFailed"), e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;

    setText(null);
    setError(null);

    readDocumentText(doc.id)
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [doc, onClose]);

  return (
    <ModalShell
      open={doc !== null}
      title={doc?.displayName ?? ""}
      icon={<IconFile className="h-4 w-4 shrink-0 text-emerald-400" />}
      maxWidthClass="max-w-4xl"
      onClose={onClose}
      footer={
        <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-2">
          {/*
            **保存できないときの逃げ道も同じ場所に出す。**
            押しても何も起きないと、どこから取ればよいか分からず詰まる。
          */}
          <span className="min-w-0 flex-1 t-label leading-relaxed text-slate-600">
            {tr("doc.downloadHint")}
          </span>
          <button
            type="button"
            disabled={text === null || saving}
            onClick={() => void download()}
            className="shrink-0 rounded-md border border-slate-700 px-3 py-1.5 t-body text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
          >
            {tr("doc.download")}
          </button>
        </footer>
      }
    >
        <div className="sticky top-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-800 bg-slate-900 px-4 py-2 t-label text-slate-500">
          <span>{tr("doc.originalName", { name: doc?.originalName ?? "" })}</span>
          <span>{tr("doc.sizeKb", { size: ((doc?.sizeBytes ?? 0) / 1024).toFixed(0) })}</span>
          <span>{tr("doc.charCount", { count: (doc?.charCount ?? 0).toLocaleString() })}</span>
          <span>
            {tr("doc.tokenEstimate", {
              count: (doc?.tokenEstimate ?? 0).toLocaleString(),
            })}
          </span>
          <span>
            {tr("doc.importedAt", {
              when: doc ? new Date(doc.savedAtMs).toLocaleString() : tr("common.none"),
            })}
          </span>
        </div>

        <div className="p-4">
          {error ? (
            <p className="selectable rounded border border-red-900 bg-red-950/40 px-3 py-2 t-label text-red-300">
              {error}
            </p>
          ) : text === null ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div
                  key={i}
                  className="h-2.5 animate-pulse rounded bg-slate-800"
                  style={{ width: `${60 + ((i * 17) % 40)}%` }}
                />
              ))}
            </div>
          ) : (
            <pre className="selectable whitespace-pre-wrap break-words font-mono t-label leading-relaxed text-slate-300">
              {text}
            </pre>
          )}
        </div>
    </ModalShell>
  );
}
