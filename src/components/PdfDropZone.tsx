import { useRef, useState, type DragEvent } from "react";
import type { DroppedDocument } from "@/types";
import { IconUpload, IconFile, IconClose } from "@/components/Icons";

interface Props {
  documents: DroppedDocument[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 一次資料（PDF 等）のドロップゾーン。
 * Phase 1 はファイル名を受け取るだけで、解析は行わない。
 */
export default function PdfDropZone({ documents, onAdd, onRemove }: Props) {
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    onAdd(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-[12px] transition-colors ${
          isOver
            ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
            : "border-slate-700 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
        }`}
      >
        <IconUpload className="h-4 w-4" />
        <span>決算PDF・IR資料をドロップ</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.htm,.html"
          className="hidden"
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {documents.length > 0 && (
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {documents.map((doc) => (
            <div
              key={doc.id}
              title={doc.name}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 pl-2 pr-1 text-[12px] text-slate-300"
            >
              <IconFile className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="max-w-40 truncate">{doc.name}</span>
              <span className="text-[11px] text-slate-500">{formatSize(doc.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(doc.id)}
                aria-label={`${doc.name} を外す`}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
              >
                <IconClose className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
