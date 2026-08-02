import { useEffect, useRef } from "react";
import type { AnalysisRun } from "@/lib/prompts/analysisRunner";
import type { TickerAnalysis } from "@/types";
import { CRITERIA } from "@/lib/prompts/criteria";
import type { SlotId } from "@/lib/ui/layoutStore";
import CriterionScoreRow from "@/components/CriterionScoreRow";
import PanelHeader from "@/components/PanelHeader";
import AnalystRoleMenu from "@/components/AnalystRoleMenu";
import ExportMenu from "@/components/ExportMenu";
import { buildAnalysisRecord } from "@/lib/export/analysisRecord";
import { useAccess } from "@/lib/license/freeTierStore";
import { lockHint } from "@/lib/license/lockMessages";
import {
  IconBookmark,
  IconChart,
  IconPlay,
  IconStop,
  IconTrash,
} from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  ticker: string | null;
  run: AnalysisRun | undefined;
  /** LLM を呼べる状態か（APIキー等がそろっているか） */
  ready: boolean;
  readyReason: string | null;
  slot?: SlotId;
  onToggleCollapse: () => void;
  /** 最小化できない場合の理由（最後の 1 枚は畳ませない） */
  collapseDisabledReason?: string | null;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  /** マイポートフォリオへの保存先を選ぶ */
  onSaveToPortfolio: () => void;
  /** エクスポート用。市場データが要るので親から受け取る */
  analysis?: TickerAnalysis;
  onOpenSettings: () => void;
}

/** 状態の見出し。**辞書キー**を持ち、表示するときに引く。 */
const PHASE_LABEL: Record<AnalysisRun["phase"], string> = {
  idle: "analysis.phase.idle",
  collecting: "analysis.phase.collecting",
  streaming: "analysis.phase.streaming",
  done: "analysis.phase.done",
  error: "analysis.phase.error",
  cancelled: "analysis.phase.cancelled",
};

/** 20項目のファンダメンタル分析結果パネル。 */
export default function AnalysisPanel({
  ticker,
  run,
  ready,
  readyReason,
  slot,
  onToggleCollapse,
  collapseDisabledReason = null,
  onRun,
  onCancel,
  onClear,
  onSaveToPortfolio,
  analysis,
  onOpenSettings,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const streaming = run?.phase === "streaming" || run?.phase === "collecting";
  const result = run?.result ?? null;
  const hasContent = (run?.raw.length ?? 0) > 0;

  // 体験期間切れ・銘柄上限。**既存の結果を開いているだけなら止めない**
  const access = useAccess(ticker);
  const locked = !access.allowed && access.reason !== "none";
  const lockedReason = locked
    ? lockHint(access.reason as "trialExpired" | "tickerLimit")
    : "";

  // ストリーミング中は末尾を追いかける
  useEffect(() => {
    if (streaming) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [run?.raw, streaming]);

  const subtitle =
    run && run.phase !== "idle" ? (
      <>
        {t(PHASE_LABEL[run.phase])}
        {run.model ? ` / ${run.model}` : ""}
        {run.fromCache && run.savedAtMs
          ? t("analysis.restored", {
              when: new Date(run.savedAtMs).toLocaleString(),
            })
          : ""}
      </>
    ) : undefined;

  return (
    <section className="panel bg-slate-950" data-panel-slot={slot}>
      <PanelHeader
        icon={<IconChart className="h-3.5 w-3.5" />}
        title={t("panel.analysis")}
        subtitle={subtitle}
        slot={slot}
        onToggleCollapse={onToggleCollapse}
        collapseDisabledReason={collapseDisabledReason}
        actions={
          <>
            <AnalystRoleMenu />

            {result && result.averageScore !== null && (
              <span className="t-label shrink-0 font-mono text-emerald-400">
                平均 {result.averageScore.toFixed(1)} / 5
              </span>
            )}

            {hasContent && !streaming && ticker && (
              <ExportMenu
                label={t("analysis.export")}
                records={() => [
                  buildAnalysisRecord({
                    ticker,
                    raw: run?.raw ?? "",
                    fundamentals: analysis?.fundamentals ?? null,
                    quarterly: analysis?.quarterly ?? null,
                    provider: run?.provider ?? null,
                    model: run?.model ?? null,
                    savedAtMs: run?.savedAtMs ?? Date.now(),
                  }),
                ]}
              />
            )}

            {hasContent && !streaming && (
              <button
                type="button"
                onClick={onSaveToPortfolio}
                title={t("analysis.saveHint")}
                className="t-label flex min-h-6 shrink-0 items-center gap-1 rounded border border-slate-700 px-2 text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
              >
                <IconBookmark className="h-3 w-3" />
                {t("analysis.save")}
              </button>
            )}

            {hasContent && !streaming && (
              <button
                type="button"
                onClick={onClear}
                title={t("analysis.clearHint")}
                className="t-label flex min-h-6 shrink-0 items-center gap-1 rounded border border-slate-700 px-2 text-slate-400 hover:border-red-800 hover:text-red-300"
              >
                <IconTrash className="h-3 w-3" />
                {t("analysis.clear")}
              </button>
            )}

            {streaming ? (
              <button
                type="button"
                onClick={onCancel}
                className="t-label flex min-h-6 shrink-0 items-center gap-1.5 rounded border border-red-800 px-2 text-red-300 hover:bg-red-950/50"
              >
                <IconStop className="h-3 w-3" />
                {t("analysis.cancel")}
              </button>
            ) : (
              <button
                type="button"
                onClick={onRun}
                /*
                 * 体験期間切れのときは `disabled` を付けない。
                 * **本物の disabled はクリックを拾えず、案内を出せない。**
                 * 見た目と支援技術には無効と伝えつつ、押されたら
                 * 購入案内のダイアログを出す（判定は `App.ensureAccess`）。
                 */
                disabled={!ticker || !ready}
                aria-disabled={locked || undefined}
                title={
                  locked
                    ? lockedReason
                    : !ticker
                      ? t("analysis.needTicker")
                      : (readyReason ?? t("analysis.run"))
                }
                className={`t-label flex min-h-6 shrink-0 items-center gap-1.5 rounded px-2.5 font-medium disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 ${
                  locked
                    ? "cursor-not-allowed bg-slate-800 text-slate-500"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                }`}
              >
                <IconPlay className="h-3 w-3" />
                {locked ? t("analysis.trialOver") : hasContent ? t("analysis.rerun") : t("analysis.run")}
              </button>
            )}
          </>
        }
      />

      {/* 何をもとに分析したかを常に見えるようにする */}
      {run && run.basis.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-800/80 bg-slate-900/30 px-4 py-1.5">
          <span className="t-label shrink-0 text-slate-500">{t("analysis.basis")}</span>
          {run.basis.map((item) => (
            <span
              key={item}
              title={item}
              className="t-label max-w-64 truncate rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-400"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="panel-scroll px-4 py-3">
          {!ticker ? (
            <p className="t-body text-slate-500">
              {t("analysis.emptyHint", { count: CRITERIA.length })}
            </p>
          ) : !run || run.phase === "idle" ? (
            <div className="t-body space-y-2 text-slate-500">
              <p>{t("analysis.idleHint", { count: CRITERIA.length })}</p>
              {!ready && (
                <p className="text-amber-500/90">
                  {readyReason}
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="ml-1 underline underline-offset-2 hover:text-amber-400"
                  >
                    {t("help.openSettings")}
                  </button>
                </p>
              )}
            </div>
          ) : (
            <>
              {run.notes.length > 0 && (
                <ul className="mb-3 space-y-1 rounded border border-amber-900/60 bg-amber-950/25 px-3 py-2">
                  {run.notes.map((note) => (
                    <li key={note} className="selectable t-label text-amber-300">
                      {note}
                    </li>
                  ))}
                </ul>
              )}

              {run.error && (
                <p className="selectable t-body mb-3 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-red-300">
                  {run.error}
                </p>
              )}

              {run.phase === "collecting" && (
                <p className="t-body mb-3 flex items-center gap-2 text-slate-500">
                  <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-slate-600 border-t-emerald-500" />
                  {t("analysis.collecting")}
                </p>
              )}

              {result && result.rows.length > 0 && (
                <div className="mb-5">
                  <h3 className="t-heading mb-2 flex items-baseline gap-2 font-medium uppercase tracking-wider text-slate-500">
                    {t("analysis.scoreTable")}
                    <span className="t-label font-mono normal-case text-slate-600">
                      {t("analysis.rowCount", {
                        done: result.rows.length,
                        total: CRITERIA.length,
                      })}
                    </span>
                  </h3>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-1">
                    {result.rows.map((row) => (
                      <CriterionScoreRow key={row.id} row={row} />
                    ))}
                  </div>
                </div>
              )}

              {result && result.strengths.length > 0 && (
                <BulletSection title={t("analysis.strengths")} tone="emerald" items={result.strengths} />
              )}
              {result && result.risks.length > 0 && (
                <BulletSection title={t("analysis.risks")} tone="amber" items={result.risks} />
              )}
              {result?.valuation && (
                <TextSection title={t("analysis.valuation")} body={result.valuation} />
              )}
              {result?.conclusion && (
                <TextSection title={t("analysis.conclusion")} body={result.conclusion} highlight />
              )}

              {streaming && (
                <p className="t-label mt-2 flex items-center gap-2 text-slate-600">
                  <span className="inline-block h-3 w-1.5 animate-pulse bg-emerald-500" />
                  {t("analysis.streamingChars", {
                    chars: run.raw.length.toLocaleString(),
                  })}
                </p>
              )}

              {/* 構造化に失敗した場合でも生テキストは見せる */}
              {!streaming && result && result.rows.length === 0 && run.raw.length > 0 && (
                <pre className="selectable t-body whitespace-pre-wrap break-words text-slate-300">
                  {run.raw}
                </pre>
              )}
            </>
          )}
      </div>
    </section>
  );
}

function BulletSection({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "emerald" | "amber";
  items: string[];
}) {
  const color = tone === "emerald" ? "text-emerald-400" : "text-amber-400";
  return (
    <div className="mb-5">
      <h3 className={`t-heading mb-2 font-medium uppercase tracking-wider ${color}`}>
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className={`selectable t-body flex gap-2 text-slate-300`}>
            <span className={`shrink-0 ${color}`}>•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextSection({
  title,
  body,
  highlight = false,
}: {
  title: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <div className="mb-5">
      <h3 className="t-heading mb-2 font-medium uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <p
        className={`selectable t-body whitespace-pre-wrap ${
          highlight
            ? "rounded border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-slate-100"
            : "text-slate-300"
        }`}
      >
        {body}
      </p>
    </div>
  );
}
