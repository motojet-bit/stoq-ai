import { useState } from "react";
import { IconChevronDown, IconChevronUp } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

/**
 * クラウド同期の手順ガイド（折り畳み）。
 *
 * **既定は閉じておく。** 設定を済ませた人には毎回読ませる必要がなく、
 * 開いたままだと肝心の接続ボタンが画面の下へ押し出される。
 */
export default function CloudSyncGuide() {
  const [open, setOpen] = useState(false);
  const t = useT();

  const steps = [
    t("cloud.guide.step1"),
    t("cloud.guide.step2"),
    t("cloud.guide.step3"),
  ];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-800/40"
      >
        <span aria-hidden="true">💡</span>
        <span className="min-w-0 flex-1 t-label font-medium text-slate-300">
          {t("cloud.guide.title")}
        </span>
        {open ? (
          <IconChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        ) : (
          <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        )}
      </button>

      {open && (
        <ol className="space-y-2 border-t border-slate-800 px-3 py-2.5">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2.5 t-label leading-relaxed text-slate-400">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono text-[0.65rem] text-slate-300">
                {i + 1}
              </span>
              <span className="selectable min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
