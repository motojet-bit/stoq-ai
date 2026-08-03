import { ANALYSIS_STEPS, PROGRESS_STAGES, progressRatio } from "@/lib/prompts/analysisSteps";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  /** 完了した段の数（0〜4） */
  completedSteps: number;
  /** いま生成している段のラベル。走っていなければ null */
  currentStepLabel: string | null;
  running: boolean;
}

/**
 * 5 段階の進捗メーター。
 *
 * **どの段まで終わったかを見せる。** 4 段を直列に回すので、
 * 1 本のスピナーだけだと「長いのか止まったのか」が分からない。
 * 終わった段は緑で確定させ、**そこまでは保存済み**であることを示す。
 */
export default function AnalysisProgress({
  completedSteps,
  currentStepLabel,
  running,
}: Props) {
  const t = useT();
  const ratio = progressRatio(completedSteps, running);

  return (
    <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-label font-medium text-slate-300">
          {currentStepLabel ?? t("step.prepare")}
        </span>
        <span className="font-mono t-label text-slate-500">
          {t("step.progress", { done: completedSteps, total: ANALYSIS_STEPS.length })}
        </span>
      </div>

      {/* 段ごとの目盛り。終わった段は緑で埋める */}
      <div className="mt-2 flex gap-1">
        {Array.from({ length: PROGRESS_STAGES }, (_, i) => {
          // 0 番目は準備段。以降が生成の 4 段
          const done = i <= completedSteps;
          const active = running && i === completedSteps + 1;
          return (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                done
                  ? "bg-emerald-500"
                  : active
                    ? "animate-pulse bg-emerald-700"
                    : "bg-slate-800"
              }`}
            />
          );
        })}
      </div>

      <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full bg-emerald-600/60 transition-all duration-500"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
