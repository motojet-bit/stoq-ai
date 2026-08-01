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
 *
 * **文字サイズはここで固定する（`.ui-fixed`）。**
 * 本文の可変フォントに引きずられると、タイトル・本文・ボタンの比率が崩れて
 * 野暮ったく見えるため、ダイアログは常に同じ見た目にする。
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
      className="ui-fixed fixed inset-0 z-200 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3.5 px-6 pb-5 pt-6">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] ${
              destructive
                ? "bg-red-950 text-red-300 ring-1 ring-red-800/70"
                : "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-800/70"
            }`}
          >
            {destructive ? "!" : "?"}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold leading-snug text-slate-50">{title}</h2>
            <p className="selectable mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-400">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 bg-slate-950/40 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="rounded-lg border border-slate-600 px-4 py-2 text-[13px] font-medium text-slate-200 transition-colors duration-150 hover:border-slate-500 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 ${
              destructive
                ? "bg-red-600 hover:bg-red-500 focus-visible:ring-red-400/70"
                : "bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-400/70"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
