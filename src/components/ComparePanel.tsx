import { useEffect, useMemo, useState } from "react";
import type { SavedAnalysis } from "@/types";
import { invoke, isTauri } from "@/lib/tauri";
import { loadTicker, useAnalyses } from "@/lib/api/analysisStore";
import {
  bestTickerFor,
  buildComparison,
  COMPARE_METRICS,
  MAX_COMPARE,
  metricLabel,
  type CompareSource,
} from "@/lib/compare/compareData";
import { IconChart, IconWarning } from "@/components/Icons";
import { t as tr, useT  } from "@/lib/i18n/i18n";

interface Props {
  tickers: string[];
  /** 単体分析へ移動する */
  onOpenTicker: (ticker: string) => void;
}

/** スコア 0〜5 を横棒で表す。数字だけより差が一目で分かる。 */
function ScoreBar({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="t-label text-slate-600">{tr("common.none")}</span>;
  }
  const ratio = Math.max(0, Math.min(score / 5, 1));
  const tone =
    score >= 4 ? "bg-emerald-500" : score >= 3 ? "bg-slate-400" : "bg-amber-500";

  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
        <span
          className={`block h-full rounded-full ${tone}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="w-7 shrink-0 text-right font-mono t-label text-slate-300">
        {score.toFixed(1)}
      </span>
    </span>
  );
}

/**
 * 複数銘柄の横並び比較ダッシュボード。
 *
 * 市場データは取得済みのものを使い、AI スコアは保存済みの分析結果から読む。
 * **未分析の銘柄も列としては出す。** 市場データだけでも比べたい場面があるうえ、
 * 「何が足りないか」をその場で示したほうが次の行動につながるため。
 */
export default function ComparePanel({ tickers, onOpenTicker }: Props) {
  const t = useT();
  const analyses = useAnalyses();
  const [saved, setSaved] = useState<Record<string, SavedAnalysis | null>>({});
  const [loading, setLoading] = useState(true);

  const targets = useMemo(() => tickers.slice(0, MAX_COMPARE), [tickers]);

  // 市場データが無い銘柄は取りに行く
  useEffect(() => {
    for (const ticker of targets) {
      if (!analyses[ticker]) void loadTicker(ticker);
    }
    // 取得済みの銘柄まで再取得しないよう、対象が変わったときだけ走らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.join(",")]);

  // 保存済みの分析結果を読む
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const entries: Record<string, SavedAnalysis | null> = {};
      for (const ticker of targets) {
        entries[ticker] = isTauri()
          ? await invoke<SavedAnalysis | null>("analysis_load", { ticker }).catch(() => null)
          : null;
      }
      if (!cancelled) {
        setSaved(entries);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targets.join(",")]);

  const view = useMemo(() => {
    const sources: CompareSource[] = targets.map((ticker) => ({
      ticker,
      fundamentals: analyses[ticker]?.fundamentals ?? null,
      quarterly: analyses[ticker]?.quarterly ?? null,
      analysis: saved[ticker] ?? null,
    }));
    return buildComparison(sources);
  }, [targets, analyses, saved]);

  if (targets.length === 0) {
    return (
      <div className="panel-scroll px-4 py-6">
        <p className="t-body text-slate-500">
          {t("compare.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="panel-scroll px-4 py-3">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 t-body font-semibold text-slate-100">
          <IconChart className="h-4 w-4 text-emerald-400" />
          {t("compare.title")}
        </h2>
        <span className="t-label text-slate-500">
          {t("history.tickerCount", { count: view.columns.length })}
          {loading ? ` ${t("compare.loading")}` : ""}
        </span>
      </header>

      {/* 未分析の銘柄をまとめて案内する */}
      {view.notices.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 t-label font-medium text-amber-300">
            <IconWarning className="h-3.5 w-3.5 shrink-0" />
            {t("compare.missingData")}
          </p>
          <ul className="space-y-0.5">
            {view.notices.map((notice) => (
              <li key={notice} className="t-label text-amber-200/90">
                {notice}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --------------------------------------------- サマリー比較テーブル */}
      <section className="mb-5">
        <h3 className="mb-2 t-heading font-medium uppercase tracking-wider text-slate-500">
          {t("compare.summary")}
        </h3>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60">
                <th className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left t-label font-medium text-slate-500">
                  {t("compare.metric")}
                </th>
                {view.columns.map((column) => (
                  <th key={column.ticker} className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenTicker(column.ticker)}
                      title={t("compare.openTab", { ticker: column.ticker })}
                      className="block w-full text-right"
                    >
                      <span className="block font-mono t-body font-semibold text-emerald-300">
                        {column.ticker}
                      </span>
                      <span className="block max-w-40 truncate t-label font-normal text-slate-500">
                        {column.name}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_METRICS.map((row) => {
                const best = bestTickerFor(view.columns, row.key);
                return (
                  <tr
                    key={row.key}
                    className="border-b border-slate-800/70 last:border-0 odd:bg-slate-900/30"
                  >
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-slate-950 px-3 py-1.5 text-left t-label font-normal text-slate-400">
                      {metricLabel(row.key)}
                    </th>
                    {view.columns.map((column) => {
                      const value = column.metrics[row.key];
                      const isBest = best === column.ticker;
                      return (
                        <td
                          key={column.ticker}
                          className={`whitespace-nowrap px-3 py-1.5 text-right font-mono t-label ${
                            isBest
                              ? "font-semibold text-emerald-300"
                              : value.raw === null
                                ? "text-slate-600"
                                : "text-slate-200"
                          }`}
                          title={isBest ? t("compare.bestHint") : undefined}
                        >
                          {value.display}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-1.5 t-label text-slate-600">
          {t("compare.bestNote")}
        </p>
      </section>

      {/* --------------------------------------------- 5ブロック AI スコア */}
      <section>
        <h3 className="mb-2 t-heading font-medium uppercase tracking-wider text-slate-500">
          {t("compare.scores")}
        </h3>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {view.columns.map((column) => (
            <div
              key={column.ticker}
              className={`rounded-lg border p-3 ${
                column.analyzed
                  ? "border-slate-800 bg-slate-900/50"
                  : "border-slate-800/60 bg-slate-900/20"
              }`}
            >
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-mono t-body font-semibold text-emerald-300">
                    {column.ticker}
                  </span>
                  <span className="block truncate t-label text-slate-500">
                    {column.name}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {column.averageScore !== null ? (
                    <>
                      <span className="block font-mono t-body font-semibold text-slate-100">
                        {column.averageScore.toFixed(1)}
                      </span>
                      <span className="block t-label text-slate-600">{t("compare.average")}</span>
                    </>
                  ) : (
                    <span className="t-label text-slate-600">{t("portfolio.unanalyzed")}</span>
                  )}
                </span>
              </div>

              {column.analyzed ? (
                <>
                  <ul className="space-y-1.5">
                    {column.blocks.map((block) => (
                      <li key={block.id} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 t-label text-slate-400">
                          {block.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <ScoreBar score={block.score} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {column.savedAtMs !== null && (
                    <p className="mt-2 t-label text-slate-600">
                      {t("compare.savedAt", {
                        when: new Date(column.savedAtMs).toLocaleString(),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <p className="t-label leading-relaxed text-amber-300/90">
                    {column.notice}
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenTicker(column.ticker)}
                    className="min-h-7 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
                  >
                    {t("compare.analyzeTicker", { ticker: column.ticker })}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
