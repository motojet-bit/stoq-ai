import { useEffect, useRef } from "react";
import type { AnalysisRun } from "@/lib/prompts/analysisRunner";
import { CRITERIA } from "@/lib/prompts/criteria";
import type { SlotId } from "@/lib/ui/layoutStore";
import CriterionScoreRow from "@/components/CriterionScoreRow";
import PanelHeader from "@/components/PanelHeader";
import { IconChart, IconPlay, IconStop, IconTrash } from "@/components/Icons";

interface Props {
  ticker: string | null;
  run: AnalysisRun | undefined;
  /** LLM を呼べる状態か（APIキー等がそろっているか） */
  ready: boolean;
  readyReason: string | null;
  collapsed: boolean;
  slot?: SlotId;
  onToggleCollapse: () => void;
  onRun: () => void;
  onCancel: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
}

const PHASE_LABEL: Record<AnalysisRun["phase"], string> = {
  idle: "未実行",
  collecting: "資料を収集中…",
  streaming: "分析中…",
  done: "完了",
  error: "失敗",
  cancelled: "中断",
};

/** 20項目のファンダメンタル分析結果パネル。 */
export default function AnalysisPanel({
  ticker,
  run,
  ready,
  readyReason,
  collapsed,
  slot,
  onToggleCollapse,
  onRun,
  onCancel,
  onClear,
  onOpenSettings,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const streaming = run?.phase === "streaming" || run?.phase === "collecting";
  const result = run?.result ?? null;
  const hasContent = (run?.raw.length ?? 0) > 0;

  // ストリーミング中は末尾を追いかける
  useEffect(() => {
    if (streaming) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [run?.raw, streaming]);

  const subtitle =
    run && run.phase !== "idle" ? (
      <>
        {PHASE_LABEL[run.phase]}
        {run.model ? ` / ${run.model}` : ""}
        {run.fromCache && run.savedAtMs
          ? `（${new Date(run.savedAtMs).toLocaleString("ja-JP")} に保存した結果を復元）`
          : ""}
      </>
    ) : undefined;

  return (
    <section className="panel bg-slate-950">
      <PanelHeader
        icon={<IconChart className="h-3.5 w-3.5" />}
        title="分析結果"
        subtitle={subtitle}
        collapsed={collapsed}
        slot={slot}
        onToggleCollapse={onToggleCollapse}
        actions={
          <>
            {result && result.averageScore !== null && (
              <span className="t-label shrink-0 font-mono text-emerald-400">
                平均 {result.averageScore.toFixed(1)} / 5
              </span>
            )}

            {hasContent && !streaming && (
              <button
                type="button"
                onClick={onClear}
                title="この銘柄の分析結果を削除（保存済みキャッシュも消えます）"
                className="t-label flex min-h-6 shrink-0 items-center gap-1 rounded border border-slate-700 px-2 text-slate-400 hover:border-red-800 hover:text-red-300"
              >
                <IconTrash className="h-3 w-3" />
                クリア
              </button>
            )}

            {streaming ? (
              <button
                type="button"
                onClick={onCancel}
                className="t-label flex min-h-6 shrink-0 items-center gap-1.5 rounded border border-red-800 px-2 text-red-300 hover:bg-red-950/50"
              >
                <IconStop className="h-3 w-3" />
                中断
              </button>
            ) : (
              <button
                type="button"
                onClick={onRun}
                disabled={!ticker || !ready}
                title={!ticker ? "先に銘柄を分析してください" : (readyReason ?? "AI分析を実行")}
                className="t-label flex min-h-6 shrink-0 items-center gap-1.5 rounded bg-emerald-600 px-2.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                <IconPlay className="h-3 w-3" />
                {hasContent ? "再分析" : "AI分析を実行"}
              </button>
            )}
          </>
        }
      />

      {/* 何をもとに分析したかを常に見えるようにする */}
      {!collapsed && run && run.basis.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-800/80 bg-slate-900/30 px-4 py-1.5">
          <span className="t-label shrink-0 text-slate-500">分析根拠:</span>
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

      {!collapsed && (
        <div ref={scrollRef} className="panel-scroll px-4 py-3">
          {!ticker ? (
            <p className="t-body text-slate-500">
              上部にティッカーを入力して「分析」を押すと、この銘柄の
              {CRITERIA.length}項目評価を実行できます。
            </p>
          ) : !run || run.phase === "idle" ? (
            <div className="t-body space-y-2 text-slate-500">
              <p>
                「AI分析を実行」を押すと、財務指標・四半期推移・SEC提出書類・一時保存中の資料を
                統合して{CRITERIA.length}項目の評価を生成します。
              </p>
              {!ready && (
                <p className="text-amber-500/90">
                  {readyReason}
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="ml-1 underline underline-offset-2 hover:text-amber-400"
                  >
                    設定を開く
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
                  SEC 提出書類と一時保存資料を読み込んでいます…
                </p>
              )}

              {result && result.rows.length > 0 && (
                <div className="mb-5">
                  <h3 className="t-heading mb-2 flex items-baseline gap-2 font-medium uppercase tracking-wider text-slate-500">
                    評価テーブル
                    <span className="t-label font-mono normal-case text-slate-600">
                      {result.rows.length} / {CRITERIA.length} 項目
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
                <BulletSection title="強み" tone="emerald" items={result.strengths} />
              )}
              {result && result.risks.length > 0 && (
                <BulletSection title="リスク" tone="amber" items={result.risks} />
              )}
              {result?.valuation && (
                <TextSection title="バリュエーション所見" body={result.valuation} />
              )}
              {result?.conclusion && (
                <TextSection title="総合投資判断" body={result.conclusion} highlight />
              )}

              {streaming && (
                <p className="t-label mt-2 flex items-center gap-2 text-slate-600">
                  <span className="inline-block h-3 w-1.5 animate-pulse bg-emerald-500" />
                  生成中…（{run.raw.length.toLocaleString()} 文字）
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
      )}
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
