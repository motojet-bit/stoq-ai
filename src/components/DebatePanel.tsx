import { cancelDebate, clearDebate, runDebateTurn, useDebateRun } from "@/lib/debate/debateStore";
import { debateGate, isRunning } from "@/lib/debate/debateTurn";
import { useSettings } from "@/lib/config/settingsStore";
import { IconStop, IconTrash, IconWarning } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  ticker: string | null;
  /** メイン分析（左）の本文。空なら検証する対象が無い */
  analysisText: string | null;
  onOpenSettings: () => void;
}

/**
 * 批判的検証ペイン（右）。
 *
 * **1 回押したら 1 往復で必ず止まる。**
 * 自動で往復を続けさせると API 費用が青天井になり、
 * 同じ論点を言い換えるだけのやり取りに落ちていく。
 * 続けたいかどうかは毎回ユーザーが決める。
 */
export default function DebatePanel({ ticker, analysisText, onOpenSettings }: Props) {
  const t = useT();
  const settings = useSettings();
  const run = useDebateRun(ticker);
  const phase = run?.phase ?? "idle";
  const status = settings?.debate ?? null;

  const gate = debateGate({ analysisText, status, phase });
  const running = isRunning(phase);
  const hasResult = Boolean(run && (run.critique || run.rebuttal));

  const blockedText =
    gate.reason === "noAnalysis"
      ? t("debate.blocked.noAnalysis")
      : gate.reason === "noKey"
        ? t("debate.blocked.noKey")
        : null;

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-slate-800 bg-slate-950">
      {/* ------------------------------------------------ 見出しと実行ボタン */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="t-label font-medium uppercase tracking-wider text-amber-400">
          {t("debate.title")}
        </span>
        {status && (
          <span className="truncate font-mono t-label text-slate-600">
            {status.effectiveModel}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {hasResult && !running && (
            <button
              type="button"
              onClick={() => ticker && clearDebate(ticker)}
              title={t("debate.clear")}
              aria-label={t("debate.clear")}
              className="rounded p-1 text-slate-600 transition-colors hover:text-red-400"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          )}
          {running ? (
            <button
              type="button"
              onClick={() => ticker && void cancelDebate(ticker)}
              className="flex min-h-7 items-center gap-1 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-red-800 hover:text-red-300"
            >
              <IconStop className="h-3 w-3" />
              {t("debate.cancel")}
            </button>
          ) : (
            <button
              type="button"
              disabled={!gate.canRun}
              onClick={() =>
                ticker && analysisText && void runDebateTurn(ticker, analysisText)
              }
              title={blockedText ?? t("debate.runHint")}
              className="min-h-7 rounded-md bg-amber-600 px-3 t-label font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              🔥 {t("debate.run")}
            </button>
          )}
        </span>
      </div>

      <div className="panel-scroll min-h-0 flex-1 px-3 py-2.5">
        {/* --------------------------------------------- 未実行のときの案内 */}
        {!hasResult && !running && (
          <div className="space-y-3">
            <p className="t-body leading-relaxed text-slate-500">{t("debate.placeholder")}</p>

            {blockedText && (
              <p className="flex items-start gap-1.5 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 t-label leading-relaxed text-amber-400/90">
                <IconWarning className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {blockedText}
                  {gate.reason === "noKey" && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="ml-1 underline underline-offset-2 hover:text-amber-200"
                    >
                      {t("help.openSettings")}
                    </button>
                  )}
                </span>
              </p>
            )}

            {status?.ready && status.sameAsMain && (
              <p className="flex items-start gap-1.5 t-label leading-relaxed text-slate-600">
                <IconWarning className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{t("debate.sameWarning")}</span>
              </p>
            )}
          </div>
        )}

        {/* --------------------------------------------- ① 批判 */}
        {(run?.critique || phase === "critique") && (
          <DebateSection
            label={t("debate.critique")}
            tone="amber"
            body={run?.critique ?? ""}
            pending={phase === "critique"}
            pendingLabel={t("debate.critiqueRunning")}
          />
        )}

        {/* --------------------------------------------- ② 反論 */}
        {(run?.rebuttal || phase === "rebuttal") && (
          <DebateSection
            label={t("debate.rebuttal")}
            tone="emerald"
            body={run?.rebuttal ?? ""}
            pending={phase === "rebuttal"}
            pendingLabel={t("debate.rebuttalRunning")}
          />
        )}

        {phase === "done" && (
          <p className="mt-3 t-label text-slate-600">{t("debate.finished")}</p>
        )}

        {phase === "error" && run?.error && (
          <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 t-label leading-relaxed text-red-300">
            {run.error}
          </p>
        )}
      </div>
    </section>
  );
}

/** 片側ぶんの表示。生成中は本文が空でも見出しだけ先に出す。 */
function DebateSection({
  label,
  tone,
  body,
  pending,
  pendingLabel,
}: {
  label: string;
  tone: "amber" | "emerald";
  body: string;
  pending: boolean;
  pendingLabel: string;
}) {
  const color = tone === "amber" ? "text-amber-400" : "text-emerald-400";
  const bar = tone === "amber" ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="mb-4">
      <h3 className={`mb-1.5 t-label font-medium uppercase tracking-wider ${color}`}>{label}</h3>
      {body ? (
        <pre className="selectable whitespace-pre-wrap break-words t-label leading-relaxed text-slate-300">
          {body}
        </pre>
      ) : null}
      {pending && (
        <p className="mt-1 flex items-center gap-2 t-label text-slate-600">
          <span className={`inline-block h-3 w-1.5 animate-pulse ${bar}`} />
          {pendingLabel}
        </p>
      )}
    </div>
  );
}
