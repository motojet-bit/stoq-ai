import { useState } from "react";
import type { Diagnosis } from "@/lib/errors/diagnose";
import { IconWarning } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  diagnosis: Diagnosis;
  /** 完了済みの段の数。0 より大きければ「続きから」と伝える */
  completedSteps: number;
  onRetry: () => void;
  onOpenSettings: () => void;
}

/**
 * 失敗したときの案内。
 *
 * **「通信に失敗しました」で終わらせない。** 原因ごとに次の一手が違うので、
 * やることを 1 つだけ示す。元のメッセージは折りたたんで残す
 * （問い合わせのときに要るが、最初から見せると読む気が失せる）。
 */
export default function AnalysisFailure({
  diagnosis,
  completedSteps,
  onRetry,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="rounded-lg border border-red-900/60 bg-red-950/25 px-3 py-2.5">
      <p className="flex items-start gap-2 t-body font-medium text-red-300">
        <IconWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {diagnosis.title}
      </p>

      <p className="mt-1.5 t-label leading-relaxed text-slate-300">{diagnosis.action}</p>

      {/* 生成済みの段があることを伝える（やり直しになると思わせない） */}
      {completedSteps > 0 && (
        <p className="mt-1.5 t-label text-emerald-400/90">
          {t("step.resumed", { done: completedSteps })}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {diagnosis.retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-7 rounded-md bg-emerald-600 px-3 t-label font-medium text-white transition-colors hover:bg-emerald-500"
          >
            {t("diagnose.retry")}
          </button>
        )}
        {diagnosis.openSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-7 rounded-md border border-slate-700 px-3 t-label text-slate-300 transition-colors hover:border-slate-600"
          >
            {t("help.openSettings")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="min-h-7 px-1 t-label text-slate-500 underline underline-offset-2 hover:text-slate-300"
        >
          {t("diagnose.detail")}
        </button>
      </div>

      {showDetail && (
        <pre className="selectable mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5 t-label text-slate-500">
          {diagnosis.detail}
        </pre>
      )}
    </div>
  );
}
