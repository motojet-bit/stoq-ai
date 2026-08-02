import {
  disclaimerSections,
  disclaimerTitle,
} from "@/lib/legal/disclaimer";
import { closeDisclaimer, useDisclaimerOpen } from "@/lib/legal/disclaimerStore";
import ModalShell from "@/components/ModalShell";
import { IconWarning } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

/**
 * 免責事項の全文。
 *
 * メニューバーの「ヘルプ > 免責事項」と、画面下部のテロップから開ける。
 * **文字サイズは `.ui-fixed` 側（ModalShell）に任せず本文サイズを使う**
 * ——読ませることが目的なので、ユーザーが文字を大きくしていれば追従させる。
 */
export default function LegalDisclaimerModal() {
  const t = useT();
  const open = useDisclaimerOpen();

  return (
    <ModalShell
      open={open}
      title={disclaimerTitle()}
      icon={<IconWarning className="h-4 w-4 text-amber-400" />}
      maxWidthClass="max-w-3xl"
      onClose={closeDisclaimer}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="t-label text-slate-500">
            {t("disclaimer.short")}
          </span>
          <button
            type="button"
            onClick={closeDisclaimer}
            className="min-h-8 shrink-0 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500"
          >
            {t("disclaimer.understood")}
          </button>
        </footer>
      }
    >
      <div className="px-6 py-5">
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2.5">
          <IconWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="t-body leading-relaxed text-amber-200/90">
            {t("disclaimer.footer")}
          </p>
        </div>

        <ol className="selectable space-y-4">
          {disclaimerSections().map((section, i) => (
            <li key={section.title}>
              <h3 className="t-body font-semibold text-slate-100">
                {i + 1}. {section.title}
              </h3>
              <p className="mt-1.5 t-body leading-[1.9] text-slate-300">{section.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </ModalShell>
  );
}
