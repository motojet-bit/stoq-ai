import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { loadArchive, useArchive, useArchiveLoading } from "@/lib/portfolio/portfolioStore";
import { groupByTicker, periodLabelOf } from "@/lib/portfolio/archive";
import { buildTransferText } from "@/lib/portfolio/heatmap";
import {
  buildAnalysisRecord,
  parseAnalysisRecord,
  type AnalysisRecord,
} from "@/lib/export/analysisRecord";
import { pushChatDraft } from "@/lib/chat/chatDraft";
import { setPortfolioSplit, usePortfolioSplit } from "@/lib/ui/portfolioLayout";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import PanelHeader from "@/components/PanelHeader";
import PortfolioHeatmap from "@/components/PortfolioHeatmap";
import ExportMenu from "@/components/ExportMenu";
import {
  IconChart,
  IconLayoutColumns,
  IconLayoutRows,
  IconMessage,
} from "@/components/Icons";

interface Props {
  onToggleCollapse: () => void;
  collapseDisabledReason?: string | null;
}

/**
 * マイポートフォリオ画面の左（上）ペイン。
 *
 * **まず全体の傾向をヒートマップで見せ**、気になった銘柄をクリックして
 * 四半期タイムラインへ降りる流れにしている。
 * 過去の自分の分析と突き合わせるのが目的なので、
 * コピー・引用・全期の一括転送・エクスポートの導線を用意した。
 */
export default function PortfolioHistoryPanel({
  onToggleCollapse,
  collapseDisabledReason = null,
}: Props) {
  const archive = useArchive();
  const loading = useArchiveLoading();
  const split = usePortfolioSplit();

  // 一覧（ヒートマップ）とタイムラインを行き来する
  const [view, setView] = useState<"heatmap" | "timeline">("heatmap");
  const [openTicker, setOpenTicker] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    void loadArchive();
  }, []);

  const archives = useMemo(() => groupByTicker(archive), [archive]);
  const selected = archives.find((a) => a.ticker === openTicker) ?? null;

  const openTimeline = (ticker: string) => {
    setOpenTicker(ticker);
    setOpenEntry(null);
    setBody(null);
    setView("timeline");
  };

  /**
   * 過去全期の本文をまとめて対話へ流し込む。
   * **1 件ずつ開かせない**——時系列で比べたいときに手間が大きすぎるため。
   */
  const transferAll = async (
    ticker: string,
    items: { id: string; label: string; score: number | null; savedAtMs: number }[],
  ) => {
    setTransferring(true);
    try {
      const sections = [];
      for (const item of items) {
        const raw = isTauri()
          ? await invoke<string | null>("analysis_history_raw", { id: item.id }).catch(
              () => null,
            )
          : null;
        if (raw) sections.push({ ...item, body: raw });
      }
      pushChatDraft(buildTransferText(ticker, sections));
      toastSuccess(`${ticker} の ${sections.length} 期分を対話へ転送しました`);
    } finally {
      setTransferring(false);
    }
  };

  /** エクスポート用のレコード。保存済みの構造化 JSON を優先する。 */
  const recordsFor = (ticker: string): AnalysisRecord[] => {
    const target = archives.find((a) => a.ticker === ticker);
    if (!target) return [];
    return target.entries.map(
      (entry) =>
        parseAnalysisRecord(entry.record ?? "{}") ??
        buildAnalysisRecord({
          ticker,
          raw: "",
          fundamentals: null,
          quarterly: null,
          provider: entry.provider,
          model: entry.model,
          savedAtMs: entry.savedAtMs,
        }),
    );
  };

  const openLog = async (id: string) => {
    if (openEntry === id) {
      setOpenEntry(null);
      setBody(null);
      return;
    }
    setOpenEntry(id);
    setBody(null);
    setFetching(true);
    try {
      const raw = isTauri()
        ? await invoke<string | null>("analysis_history_raw", { id })
        : null;
      setBody(raw ?? "本文を取得できませんでした。");
    } catch (e) {
      toastError("分析ログを開けませんでした", e);
      setBody(null);
    } finally {
      setFetching(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess("分析ログをコピーしました");
    } catch (e) {
      toastError("コピーできませんでした", e);
    }
  };

  const quote = (ticker: string, label: string, text: string) => {
    pushChatDraft(
      `以下は ${ticker} の過去の分析（${label}）です。この内容について質問します。\n\n---\n${text}\n---\n\n`,
    );
    toastSuccess("対話ウィンドウに引用しました");
  };

  return (
    <section className="panel bg-slate-950">
      <PanelHeader
        icon={<IconChart className="h-3.5 w-3.5" />}
        title="ポートフォリオ分析履歴"
        subtitle={loading ? "読み込み中…" : `${archives.length} 銘柄`}
        onToggleCollapse={onToggleCollapse}
        collapseDisabledReason={collapseDisabledReason}
        actions={
          // 過去ログと対話の並べ方を切り替える
          <span className="ui-fixed flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPortfolioSplit("horizontal")}
              aria-pressed={split === "horizontal"}
              title="縦分割（左右に並べる）"
              className={`rounded p-1 transition-colors ${
                split === "horizontal"
                  ? "bg-slate-700 text-emerald-300"
                  : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <IconLayoutColumns className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPortfolioSplit("vertical")}
              aria-pressed={split === "vertical"}
              title="横分割（上下に並べる）"
              className={`rounded p-1 transition-colors ${
                split === "vertical"
                  ? "bg-slate-700 text-emerald-300"
                  : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <IconLayoutRows className="h-3.5 w-3.5" />
            </button>
          </span>
        }
      />

      <div className="panel-scroll px-3 py-2">
        {view === "heatmap" ? (
          <PortfolioHeatmap entries={archive} onSelectTicker={openTimeline} />
        ) : (
          <>
            {/* タイムライン。一覧へ戻る導線は必ず残す */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setView("heatmap")}
                className="min-h-6 shrink-0 rounded border border-slate-700 px-2 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
              >
                ← 一覧へ戻る
              </button>
              <span className="font-mono t-body font-semibold text-emerald-300">
                {selected?.ticker ?? "—"}
              </span>
              <span className="t-label text-slate-500">
                {selected?.entries.length ?? 0} 期分
              </span>

              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {selected && selected.entries.length > 0 && (
                  <button
                    type="button"
                    disabled={transferring}
                    onClick={() =>
                      void transferAll(
                        selected.ticker,
                        selected.entries.map((e) => ({
                          id: e.id,
                          label: periodLabelOf(e),
                          score: e.averageScore,
                          savedAtMs: e.savedAtMs,
                        })),
                      )
                    }
                    title="過去全四半期の分析を構造化テキストとして対話へ送る"
                    className="flex min-h-6 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-40"
                  >
                    📋 {transferring ? "転送中…" : "全期の分析データを対話へ転送"}
                  </button>
                )}
                {selected && (
                  <ExportMenu
                    label="エクスポート"
                    records={() => recordsFor(selected.ticker)}
                    disabled={selected.entries.length === 0}
                  />
                )}
              </span>
            </div>

            {selected && (
              <ul className="space-y-1.5">
                {selected.entries.map((entry) => {
                  const label = periodLabelOf(entry);
                  const expanded = openEntry === entry.id;
                  const record = parseAnalysisRecord(entry.record ?? "{}");

                  return (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/40"
                    >
                      <button
                        type="button"
                        onClick={() => void openLog(entry.id)}
                        aria-expanded={expanded}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                      >
                        <span className="shrink-0 font-mono t-label text-slate-400">
                          {label}
                        </span>
                        <span className="shrink-0 font-mono t-body font-medium text-slate-100">
                          {entry.averageScore !== null
                            ? entry.averageScore.toFixed(1)
                            : "—"}
                        </span>
                        {record?.summary.statusIcon && (
                          <span className="shrink-0">{record.summary.statusIcon}</span>
                        )}
                        <span className="min-w-0 flex-1 truncate t-label text-slate-600">
                          {new Date(entry.savedAtMs).toLocaleString("ja-JP")}
                          {entry.model ? ` / ${entry.model}` : ""}
                        </span>
                        <span className="shrink-0 t-label text-slate-500">
                          {expanded ? "閉じる" : "開く"}
                        </span>
                      </button>

                      {expanded && (
                        <div className="border-t border-slate-800 px-2.5 py-2">
                          {/* 構造化データがあれば要点を先に見せる */}
                          {record && record.blockScores.length > 0 && (
                            <div className="mb-2 grid gap-2 sm:grid-cols-2">
                              <div>
                                <div className="mb-1 t-label font-medium uppercase tracking-wider text-slate-500">
                                  ブロック別スコア
                                </div>
                                <ul className="space-y-0.5">
                                  {record.blockScores.map((b) => (
                                    <li
                                      key={b.id}
                                      className="flex items-baseline justify-between gap-2 t-label"
                                    >
                                      <span className="text-slate-400">{b.label}</span>
                                      <span className="font-mono text-slate-200">
                                        {b.score === null ? "—" : b.score.toFixed(1)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <div className="mb-1 t-label font-medium uppercase tracking-wider text-slate-500">
                                  主要数値
                                </div>
                                <ul className="space-y-0.5">
                                  {record.keyMetrics.slice(0, 6).map((m) => (
                                    <li
                                      key={m.key}
                                      className="flex items-baseline justify-between gap-2 t-label"
                                    >
                                      <span className="truncate text-slate-400">
                                        {m.label}
                                      </span>
                                      <span className="shrink-0 font-mono text-slate-200">
                                        {m.value}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}

                          {record &&
                            (record.evaluations.strengths.length > 0 ||
                              record.evaluations.risks.length > 0) && (
                              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                                <div>
                                  <div className="mb-1 t-label font-medium text-emerald-400">
                                    適合・強み
                                  </div>
                                  <ul className="space-y-0.5">
                                    {record.evaluations.strengths.map((item) => (
                                      <li
                                        key={item}
                                        className="selectable t-label text-slate-300"
                                      >
                                        ・{item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <div className="mb-1 t-label font-medium text-amber-400">
                                    基準未達・リスク
                                  </div>
                                  <ul className="space-y-0.5">
                                    {record.evaluations.risks.map((item) => (
                                      <li
                                        key={item}
                                        className="selectable t-label text-slate-300"
                                      >
                                        ・{item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}

                          {fetching ? (
                            <p className="t-label text-slate-500">読み込み中…</p>
                          ) : (
                            <>
                              <div className="mb-2 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => body && void copy(body)}
                                  disabled={!body}
                                  className="min-h-6 rounded border border-slate-700 px-2 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-40"
                                >
                                  コピー
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    body && quote(selected.ticker, label, body)
                                  }
                                  disabled={!body}
                                  className="flex min-h-6 items-center gap-1 rounded border border-slate-700 px-2 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-40"
                                >
                                  <IconMessage className="h-3 w-3" />
                                  対話へ引用
                                </button>
                              </div>
                              <pre className="selectable max-h-96 overflow-auto whitespace-pre-wrap break-words t-label leading-relaxed text-slate-300">
                                {body}
                              </pre>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
