import { useEffect } from "react";
import { MODAL_OVERLAY_CLASS } from "@/lib/ui/modalDrag";
import { IconTrash } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  open: boolean;
  /** 履歴を残したまま、新しい会話を立てる */
  onCreateNew: () => void;
  /** いまの会話ログだけを消す */
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 対話履歴を消す前の確認。
 *
 * **「消す」以外の道を同じ場所に出す。** 消したい理由の多くは
 * 「コンテキストが埋まった」で、その場合は新しい会話を立てれば済む。
 * 消す以外に手が無いと思わせると、残しておきたい記録まで失われる。
 *
 * 要約してから移す手順も書いておく。**消したあとでは実行できない**手順なので、
 * この画面で伝えないと間に合わない。
 */
export default function ChatClearDialog({ open, onCreateNew, onConfirm, onCancel }: Props) {
  const t = useT();

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
      className={`ui-fixed fixed inset-0 z-100 flex items-center justify-center p-6 ${MODAL_OVERLAY_CLASS}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-clear-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/60">
        <h2
          id="chat-clear-title"
          className="flex items-center gap-2 text-base font-semibold text-slate-100"
        >
          <IconTrash className="h-4 w-4 shrink-0 text-red-400" />
          {t("chat.clearTitle")}
        </h2>

        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-400">
          {t("chat.clearBody")}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-9 rounded-md border border-slate-700 px-4 text-sm text-slate-300 transition-colors hover:bg-slate-800"
          >
            {t("common.cancel")}
          </button>
          {/* 消さずに済む道。**消すボタンより先に置く** */}
          <button
            type="button"
            onClick={onCreateNew}
            className="min-h-9 rounded-md border border-emerald-700 px-4 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-950/50"
          >
            {t("chat.clearNew")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-9 rounded-md bg-red-700 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            {t("chat.clearConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
