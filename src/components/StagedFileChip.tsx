import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { StagedDocument } from "@/types";
import { formatTokens } from "@/lib/parser/tokenCount";
import { IconClose, IconFile, IconPencil } from "@/components/Icons";

interface Props {
  doc: StagedDocument;
  onPreview: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

/** 一時保存中の資料 1 件。クリックでプレビュー、ダブルクリックでリネーム。 */
export default function StagedFileChip({ doc, onPreview, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const name = draft.trim();
    setEditing(false);
    if (name && name !== doc.displayName) onRename(name);
    else setDraft(doc.displayName);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(doc.displayName);
      setEditing(false);
    }
  };

  return (
    <div
      title={`${doc.originalName}\n${doc.charCount.toLocaleString()} 文字 / 概算 ${doc.tokenEstimate.toLocaleString()} トークン\nクリックでプレビュー`}
      className="flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-emerald-900/70 bg-emerald-950/30 pl-1.5 pr-1 t-label"
    >
      <span aria-hidden="true" className="t-label" title="一時保存中">
        🟢
      </span>
      <IconFile className="h-3.5 w-3.5 shrink-0 text-emerald-600" />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          aria-label="表示名"
          className="selectable h-5 w-44 rounded border border-emerald-700 bg-slate-950 px-1 t-label text-slate-100 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onPreview}
          className="max-w-52 truncate text-slate-200 hover:text-emerald-300"
        >
          {doc.displayName}
        </button>
      )}

      <span className="shrink-0 font-mono t-label text-slate-500">
        {formatTokens(doc.tokenEstimate)}
      </span>

      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`${doc.displayName} の名前を変更`}
          title="名前を変更"
          className="rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-emerald-300"
        >
          <IconPencil className="h-3 w-3" />
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        aria-label={`${doc.displayName} を削除`}
        className="rounded p-0.5 text-slate-500 hover:bg-red-950/60 hover:text-red-300"
      >
        <IconClose className="h-3 w-3" />
      </button>
    </div>
  );
}
