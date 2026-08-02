import { useState } from "react";
import ModalShell from "@/components/ModalShell";
import { IconHelp } from "@/components/Icons";
import { appName } from "@/lib/ui/appMeta";
import { useT, type TranslateVars } from "@/lib/i18n/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

interface Step {
  titleKey: string;
  bodyKey: string;
  /** この手順で押すボタンがあれば */
  action?: { labelKey: string; kind: "settings" | "help" };
}

/**
 * 手順の並び。**本文は辞書に置く**ので、ここはキーだけを持つ。
 * 定数に文面を焼くと、言語を切り替えても古い言語のまま残る。
 */
const STEPS: Step[] = [
  { titleKey: "tour.welcome.title", bodyKey: "tour.welcome.body" },
  {
    titleKey: "tour.keys.title",
    bodyKey: "tour.keys.body",
    action: { labelKey: "tour.openSettings", kind: "settings" },
  },
  { titleKey: "tour.ticker.title", bodyKey: "tour.ticker.body" },
  { titleKey: "tour.documents.title", bodyKey: "tour.documents.body" },
  {
    titleKey: "tour.analyze.title",
    bodyKey: "tour.analyze.body",
    action: { labelKey: "tour.openHelp", kind: "help" },
  },
];

/**
 * 初回起動時のチュートリアル。
 *
 * 一度閉じたら二度と自動では出さない（localStorage に印を残す）。
 * ヘルプから明示的に開き直せる。
 */
export default function WelcomeTour({ open, onClose, onOpenSettings, onOpenHelp }: Props) {
  const [index, setIndex] = useState(0);
  const t = useT();

  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const isLast = index >= STEPS.length - 1;
  // アプリ名は言語で変わるので、見出しへ差し込む
  const vars: TranslateVars = { app: appName() };

  const close = () => {
    setIndex(0);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={t("tour.title")}
      icon={<IconHelp className="h-4 w-4 text-emerald-400" />}
      maxWidthClass="max-w-xl"
      onClose={close}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-emerald-500" : "w-1.5 bg-slate-700"
                }`}
              />
            ))}
          </span>

          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={close}
              className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
            >
              {t("tour.skip")}
            </button>
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
              >
                {t("tour.back")}
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? close() : setIndex((i) => i + 1))}
              className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500"
            >
              {isLast ? t("tour.start") : t("tour.next")}
            </button>
          </div>
        </footer>
      }
    >
      <div className="px-6 py-6">
        <h3 className="t-body text-[15px] font-semibold text-slate-50">
          {t(step.titleKey, vars)}
        </h3>
        <p className="selectable mt-3 whitespace-pre-wrap t-body leading-relaxed text-slate-300">
          {t(step.bodyKey, vars)}
        </p>

        {step.action && (
          <button
            type="button"
            onClick={() => {
              close();
              if (step.action?.kind === "settings") onOpenSettings();
              else onOpenHelp();
            }}
            className="mt-4 min-h-8 rounded-md border border-emerald-700 bg-emerald-950/40 px-3.5 t-body text-emerald-300 transition-colors hover:bg-emerald-900/40"
          >
            {t(step.action.labelKey)}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
