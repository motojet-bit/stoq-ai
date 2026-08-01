import { useEffect, useState } from "react";
import type { StagedDocument } from "@/types";
import { readDocumentText } from "@/lib/parser/documentStore";
import { IconClose, IconFile } from "@/components/Icons";

interface Props {
  doc: StagedDocument | null;
  onClose: () => void;
}

/** 一時保存中の資料の抽出テキストをプレビューする。 */
export default function DocumentPreviewModal({ doc, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!doc) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <IconFile className="h-4 w-4 shrink-0 text-emerald-400" />
            <h2 className="truncate text-[14px] font-semibold text-slate-100">
              {doc.displayName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="プレビューを閉じる"
            className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-800 px-4 py-2 text-[11px] text-slate-500">
          <span>元ファイル: {doc.originalName}</span>
          <span>{(doc.sizeBytes / 1024).toFixed(0)} KB</span>
          <span>{doc.charCount.toLocaleString()} 文字</span>
          <span>概算 {doc.tokenEstimate.toLocaleString()} トークン</span>
          <span>取り込み: {new Date(doc.savedAtMs).toLocaleString("ja-JP")}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="selectable rounded border border-red-900 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
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
            <pre className="selectable whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-slate-300">
              {text}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
