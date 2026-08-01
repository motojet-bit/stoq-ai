import { useEffect, useRef } from "react";
import type { AnalysisRun } from "@/lib/prompts/analysisRunner";
import { CRITERIA } from "@/lib/prompts/criteria";
import CriterionScoreRow from "@/components/CriterionScoreRow";
import { IconChart, IconPlay, IconStop } from "@/components/Icons";

interface Props {
  ticker: string | null;
  run: AnalysisRun | undefined;
  /** LLM を呼べる状態か（APIキー等がそろっているか） */
  ready: boolean;
  readyReason: string | null;
  onRun: () => void;
  onCancel: () => void;
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

/** 下部スプリット左側: 20項目のファンダメンタル分析結果。 */
export default function AnalysisPanel({
  ticker,
  run,
  ready,
  readyReason,
  onRun,
  onCancel,
  onOpenSettings,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = run?.phase === "streaming" || run?.phase === "collecting";
  const result = run?.result ?? null;

  // ストリーミング中は末尾を追いかける
  useEffect(() => {
    if (streaming) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [run?.raw, streaming]);

  return (
    <section className="flex h-full min-w-0 flex-col">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-800 px-3 text-[12px] font-medium text-slate-400">
        <IconChart className="h-3.5 w-3.5 text-slate-600" />
        分析結果
        {run && run.phase !== "idle" && (
          <span className="text-[11px] font-normal text-slate-600">
            {PHASE_LABEL[run.phase]}
            {run.model ? ` / ${run.model}` : ""}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {result && result.averageScore !== null && (
            <span className="font-mono text-[11px] text-emerald-400">
              平均 {result.averageScore.toFixed(1)} / 5
            </span>
          )}

          {streaming ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-6 items-center gap-1.5 rounded border border-red-800 px-2 text-[11px] text-red-300 hover:bg-red-950/50"
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
              className="flex h-6 items-center gap-1.5 rounded bg-emerald-600 px-2.5 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              <IconPlay className="h-3 w-3" />
              AI分析を実行
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {!ticker ? (
          <p className="text-[12px] leading-relaxed text-slate-600">
            上部にティッカーを入力して「分析」を押すと、この銘柄の
            {CRITERIA.length}項目評価を実行できます。
          </p>
        ) : !run || run.phase === "idle" ? (
          <div className="space-y-2 text-[12px] leading-relaxed text-slate-600">
            <p>
              「AI分析を実行」を押すと、財務指標・SEC提出書類・一時保存中の資料を統合して
              {CRITERIA.length}項目の評価を生成します。
            </p>
            {!ready && (
              <p className="text-amber-500/80">
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
              <ul className="mb-3 space-y-1 rounded border border-amber-900/60 bg-amber-950/25 px-2.5 py-2">
                {run.notes.map((note) => (
                  <li key={note} className="selectable text-[11px] leading-relaxed text-amber-300">
                    {note}
                  </li>
                ))}
              </ul>
            )}

            {run.error && (
              <p className="selectable mb-3 rounded border border-red-900 bg-red-950/40 px-2.5 py-2 text-[11px] leading-relaxed text-red-300">
                {run.error}
              </p>
            )}

            {run.phase === "collecting" && (
              <p className="mb-3 flex items-center gap-2 text-[12px] text-slate-500">
                <span className="h-3 w-3 animate-spin rounded-full border border-slate-600 border-t-emerald-500" />
                SEC 提出書類と一時保存資料を読み込んでいます…
              </p>
            )}

            {result && result.rows.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1.5 flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  評価テーブル
                  <span className="font-mono text-[10px] normal-case text-slate-600">
                    {result.rows.length} / {CRITERIA.length} 項目
                  </span>
                </h3>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1">
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
              <p className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                <span className="inline-block h-3 w-1.5 animate-pulse bg-emerald-500" />
                生成中…（{run.raw.length.toLocaleString()} 文字）
              </p>
            )}

            {/* 構造化に失敗した場合でも生テキストは見せる */}
            {!streaming && result && result.rows.length === 0 && run.raw.length > 0 && (
              <pre className="selectable whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-400">
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
    <div className="mb-4">
      <h3 className={`mb-1.5 text-[11px] font-medium uppercase tracking-wider ${color}`}>
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item}
            className="selectable flex gap-2 text-[11px] leading-relaxed text-slate-300"
          >
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
    <div className="mb-4">
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <p
        className={`selectable whitespace-pre-wrap text-[11px] leading-relaxed ${
          highlight
            ? "rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2 text-slate-200"
            : "text-slate-300"
        }`}
      >
        {body}
      </p>
    </div>
  );
}
