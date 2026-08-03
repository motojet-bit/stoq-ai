import { useRef, useState } from "react";
import {
  askDebate,
  cancelDebate,
  clearDebate,
  runDebateTurn,
  useDebateRun,
  type DebateSide,
} from "@/lib/debate/debateStore";
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
  const running = isRunning(phase) || run?.replying !== null;
  const hasResult = Boolean(run && (run.critique || run.rebuttal));
  const [question, setQuestion] = useState("");
  // 「質問の先頭へ戻る」で戻る位置
  const askRef = useRef<HTMLDivElement>(null);

  const send = (side: DebateSide) => {
    if (!ticker || question.trim() === "") return;
    void askDebate(ticker, question, side);
    setQuestion("");
  };

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
              disabled={run?.cancelling ?? false}
              onClick={() => ticker && void cancelDebate(ticker)}
              className="flex min-h-7 items-center gap-1 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-red-800 hover:text-red-300 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:border-slate-700"
            >
              <IconStop className="h-3 w-3" />
              {run?.cancelling ? t("analysis.cancelling") : t("debate.cancel")}
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

      {/*
        **常時出す。** 批判は無限に作れるので、ここを読まずに読むと
        「悪い材料が次々出てくる」だけの画面に見えて判断が鈍る。
      */}
      <div className="shrink-0 border-b border-slate-800 bg-amber-950/20 px-3 py-2">
        <p className="t-label font-medium text-amber-300">{t("debate.tipTitle")}</p>
        <p className="mt-0.5 t-label leading-relaxed text-slate-400">{t("debate.tipBody")}</p>
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
          <>
            {/* 続けるかどうかの判断材料。**追加分析が要らない場合を先に示す** */}
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <p className="t-label font-medium text-slate-300">{t("debate.guideTitle")}</p>
              <p className="mt-0.5 t-label leading-relaxed text-slate-500">
                {t("debate.guideBody")}
              </p>
            </div>

            {/* --------------------------------------- 続きの対話 */}
            {(run?.messages.length ?? 0) > 0 && (
              <div className="mt-4 space-y-3">
                {run?.messages.map((m) => (
                  <div key={m.id} ref={m.role === "user" ? askRef : undefined}>
                    <p
                      className={`t-label font-medium ${
                        m.role === "user"
                          ? "text-slate-400"
                          : m.role === "bear"
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {m.role === "user"
                        ? t("debate.you")
                        : m.role === "bear"
                          ? t("debate.critique")
                          : t("debate.rebuttal")}
                    </p>
                    <pre className="selectable mt-0.5 whitespace-pre-wrap break-words t-label leading-relaxed text-slate-300">
                      {m.text}
                    </pre>
                  </div>
                ))}
                {run?.replying && (
                  <p className="flex items-center gap-2 t-label text-slate-600">
                    <span className="inline-block h-3 w-1.5 animate-pulse bg-slate-600" />
                    {t("debate.replying")}
                  </p>
                )}

                {/*
                  **長い回答で流れたあと、自分の問いへ戻れるようにする。**
                  どこから読み直せばよいか分からなくなるのを防ぐ。
                */}
                <button
                  type="button"
                  onClick={() =>
                    askRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="t-label text-slate-500 underline underline-offset-2 hover:text-slate-300"
                >
                  {t("debate.jumpToQuestion")}
                </button>
              </div>
            )}
          </>
        )}

        {phase === "error" && run?.error && (
          <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 t-label leading-relaxed text-red-300">
            {run.error}
          </p>
        )}
      </div>

      {/*
        --------------------------------------------- 自由対話の入力
        **1 往復で打ち切らない。** 納得できるまで詰めたい人には、
        自分の言葉で問い直せる余地が要る。
        ただし**自動では続けない**（押したときだけ動く）。費用が青天井になる。
      */}
      {phase === "done" && (
        <div className="shrink-0 border-t border-slate-800 bg-slate-950 p-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send("bear");
              }
            }}
            rows={2}
            placeholder={t("debate.askPlaceholder")}
            className="selectable w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 t-label text-slate-100 placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              disabled={question.trim() === "" || run?.replying !== null}
              onClick={() => send("bear")}
              className="min-h-7 flex-1 rounded-md bg-amber-700/80 px-2 t-label font-medium text-white transition-colors hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {t("debate.askBear")}
            </button>
            <button
              type="button"
              disabled={question.trim() === "" || run?.replying !== null}
              onClick={() => send("bull")}
              className="min-h-7 flex-1 rounded-md bg-emerald-700/80 px-2 t-label font-medium text-white transition-colors hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {t("debate.askBull")}
            </button>
          </div>
        </div>
      )}
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
