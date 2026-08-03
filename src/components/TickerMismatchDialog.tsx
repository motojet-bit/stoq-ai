import { useEffect } from "react";
import { MODAL_OVERLAY_CLASS } from "@/lib/ui/modalDrag";
import { IconWarning } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  open: boolean;
  /** 選択中のティッカー */
  selected: string;
  /** 資料から読み取れたティッカー（分かれば） */
  foundTicker: string | null;
  /** 資料から読み取れた企業名（分かれば） */
  foundName: string | null;
  /** 判定に使った資料の名前 */
  documentName: string;
  onClose: () => void;
}

/**
 * 選択中の銘柄と添付資料の企業が食い違っているときの警告。
 *
 * **進ませない。** 別会社の資料で分析すると、AI はその会社の数字で
 * 20 項目を埋め、選択中の銘柄の分析として保存される。
 * 出力を読んでも気づけないので、ここで確実に止める。
 *
 * 「無視して続行」は置かない。**誤って続けたときの被害が、
 * 止められた不便より大きい。** 資料を入れ替えるか、銘柄を選び直せば済む。
 */
export default function TickerMismatchDialog({
  open,
  selected,
  foundTicker,
  foundName,
  documentName,
  onClose,
}: Props) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`ui-fixed fixed inset-0 z-100 flex items-center justify-center p-6 ${MODAL_OVERLAY_CLASS}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mismatch-title"
    >
      <div className="w-full max-w-md rounded-xl border border-red-900/70 bg-slate-900 p-5 shadow-2xl shadow-black/60">
        <h2
          id="mismatch-title"
          className="flex items-start gap-2 text-base font-semibold text-red-300"
        >
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0" />
          {t("mismatch.title")}
        </h2>

        <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
          {t("mismatch.body", { document: documentName })}
        </p>

        <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-slate-500">{t("mismatch.selected")}</span>
            <span className="font-mono font-semibold text-emerald-300">{selected}</span>
          </p>
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-slate-500">{t("mismatch.found")}</span>
            <span className="min-w-0 truncate text-right font-mono font-semibold text-red-300">
              {foundTicker ?? foundName ?? t("common.none")}
              {foundTicker && foundName && (
                <span className="ml-1.5 font-sans font-normal text-slate-500">{foundName}</span>
              )}
            </span>
          </p>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-500">{t("mismatch.hint")}</p>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            {t("mismatch.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
