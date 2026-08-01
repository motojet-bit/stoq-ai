import { useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  /** 本文。改行はそのまま反映される */
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** 破壊的な操作なら true（確定ボタンが赤くなる） */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 取り消せない操作の前に出す確認ダイアログ。
 * Esc と背景クリックはキャンセル扱いにする。
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 p-6"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-4 pt-5">
          <h2 className="mb-3 text-[14px] font-semibold text-slate-100">{title}</h2>
          <p className="selectable whitespace-pre-wrap text-[13px] leading-[1.9] text-slate-300">
            {message}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="h-8 rounded-md border border-slate-600 px-4 text-[13px] text-slate-200 hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-8 rounded-md px-4 text-[13px] font-medium text-white transition-colors ${
              destructive
                ? "bg-red-700 hover:bg-red-600"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
