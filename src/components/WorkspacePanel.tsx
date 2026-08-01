import type { TickerAnalysis, WorkspaceTab } from "@/types";
import MetricCard from "@/components/MetricCard";
import MetricCardSkeleton from "@/components/MetricCardSkeleton";
import FilingStatusBadge from "@/components/FilingStatusBadge";

interface Props {
  tab: WorkspaceTab | undefined;
  /** アクティブなタブの銘柄の取得状態。銘柄タブ以外では undefined */
  analysis: TickerAnalysis | undefined;
  onRetry: (ticker: string) => void;
}

/** アクティブなタブの内容（メインエリア上部） */
export default function WorkspacePanel({ tab, analysis, onRetry }: Props) {
  if (!tab) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-slate-600">
        タブがありません
      </div>
    );
  }

  // 銘柄が紐づかないタブ（既定のワークスペース）
  if (!tab.ticker) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-[15px] font-semibold text-slate-300">{tab.title}</h1>
          <p className="selectable text-[13px] leading-relaxed text-slate-500">
            上部のフォームにティッカーを入力して「分析」を押すと、
            <br />
            Yahoo Finance の主要指標と SEC の提出状況を取得します。
          </p>
          <p className="mt-3 font-mono text-[12px] text-slate-600">
            例: AAPL / NVDA / 7203.T / ASML.AS
          </p>
        </div>
      </div>
    );
  }

  const fundamentals = analysis?.fundamentals ?? null;
  const loading = analysis?.fundamentalsLoading ?? false;
  const error = analysis?.fundamentalsError ?? null;
  const change = fundamentals?.changePercent ?? null;

  return (
    <div className="h-full overflow-y-auto p-5">
      <header className="mb-4">
        <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-slate-100">
            {fundamentals?.name ?? tab.ticker}
          </h1>
          <span className="rounded bg-emerald-950 px-1.5 py-0.5 font-mono text-[12px] text-emerald-300">
            {tab.ticker}
          </span>
          {fundamentals?.exchange && (
            <span className="text-[12px] text-slate-500">{fundamentals.exchange}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {loading && !fundamentals ? (
            <div className="h-7 w-40 animate-pulse rounded bg-slate-800" />
          ) : (
            fundamentals && (
              <div className="flex items-baseline gap-2">
                <span className="selectable font-mono text-2xl font-semibold text-slate-100">
                  {fundamentals.priceDisplay}
                </span>
                {change !== null && (
                  <span
                    className={`font-mono text-[13px] ${
                      change >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                )}
              </div>
            )
          )}

          <FilingStatusBadge
            status={analysis?.filing ?? null}
            loading={analysis?.filingLoading ?? false}
            error={analysis?.filingError ?? null}
          />

          {fundamentals && (
            <span className="ml-auto text-[11px] text-slate-600">
              取得: {new Date(fundamentals.fetchedAtMs).toLocaleTimeString("ja-JP")}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3.5 py-3">
          <p className="selectable text-[12px] leading-relaxed text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => onRetry(tab.ticker!)}
            className="mt-2 h-7 rounded-md border border-red-800 px-2.5 text-[12px] text-red-200 hover:bg-red-950"
          >
            再試行
          </button>
        </div>
      )}

      {fundamentals?.warning && (
        <p className="selectable mb-4 rounded-lg border border-amber-900/70 bg-amber-950/30 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-300">
          {fundamentals.warning}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {loading && !fundamentals
          ? [0, 1, 2, 3, 4, 5].map((i) => <MetricCardSkeleton key={i} />)
          : fundamentals?.groups.map((g) => <MetricCard key={g.title} group={g} />)}
      </div>

      {!loading && !error && fundamentals && fundamentals.groups.length === 0 && (
        <p className="text-[13px] text-slate-600">
          詳細指標を取得できませんでした。銘柄によっては Yahoo Finance が指標を提供していません。
        </p>
      )}
    </div>
  );
}
