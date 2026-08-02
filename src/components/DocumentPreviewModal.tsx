import { useEffect, useState } from "react";
import type { StagedDocument } from "@/types";
import { readDocumentText } from "@/lib/parser/documentStore";
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
    >
        <div className="sticky top-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-800 bg-slate-900 px-4 py-2 t-label text-slate-500">
          <span>元ファイル: {doc?.originalName}</span>
          <span>{((doc?.sizeBytes ?? 0) / 1024).toFixed(0)} KB</span>
          <span>{(doc?.charCount ?? 0).toLocaleString()} 文字</span>
          <span>概算 {(doc?.tokenEstimate ?? 0).toLocaleString()} トークン</span>
          <span>
            取り込み: {doc ? new Date(doc.savedAtMs).toLocaleString("ja-JP") : tr("common.none")}
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
