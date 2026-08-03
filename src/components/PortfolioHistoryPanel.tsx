import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import {
  loadArchive,
  removeArchiveEntry,
  useArchive,
  useArchiveLoading,
} from "@/lib/portfolio/portfolioStore";
import { groupByTicker, periodLabelOf } from "@/lib/portfolio/archive";
import { branchLabel, buildArchiveTree } from "@/lib/portfolio/archiveTree";
import { buildTransferText } from "@/lib/portfolio/heatmap";
import {
  buildAnalysisRecord,
  parseAnalysisRecord,
  type AnalysisRecord,
} from "@/lib/export/analysisRecord";
import { markAsQuote, pushChatDraft } from "@/lib/chat/chatDraft";
import { setPortfolioSplit, usePortfolioSplit } from "@/lib/ui/portfolioLayout";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import PanelHeader from "@/components/PanelHeader";
import PortfolioHeatmap from "@/components/PortfolioHeatmap";
import QuarterCompareTable from "@/components/QuarterCompareTable";
import ExportMenu from "@/components/ExportMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import CollapsibleSection from "@/components/CollapsibleSection";
import {
  IconChart,
  IconLayoutColumns,
  IconLayoutRows,
  IconMessage,
  IconTrash,
} from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

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
  const t = useT();
  const loading = useArchiveLoading();
  const split = usePortfolioSplit();

  // 一覧（ヒートマップ）とタイムラインを行き来する
  const [view, setView] = useState<"heatmap" | "quarter" | "timeline">("heatmap");
  const [openTicker, setOpenTicker] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  // 削除の確認待ち（対象の 1 件）
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    ticker: string;
    label: string;
  } | null>(null);

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
      toastSuccess(t("history.forwarded", { ticker, count: sections.length }));
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
      setBody(raw ?? t("history.bodyMissing"));
    } catch (e) {
      toastError(t("history.openFailed"), e);
      setBody(null);
    } finally {
      setFetching(false);
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    // 開いていた本文が消した行のものなら畳む（消えた記録を読ませない）
    if (openEntry === target.id) {
      setOpenEntry(null);
      setBody(null);
    }
    if (await removeArchiveEntry(target.id)) {
      toastSuccess(t("history.deleted", { ticker: target.ticker, label: target.label }));
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess(t("history.copied"));
    } catch (e) {
      toastError(t("history.copyFailed"), e);
    }
  };

  const quote = (ticker: string, label: string, text: string) => {
    // 引用部分に目印を付ける。画面では赤字になり、自分が書いた文と見分けが付く
    pushChatDraft(
      `${t("history.quotePrefix", { ticker, label })}\n\n${markAsQuote(text)}\n\n`,
    );
    toastSuccess(t("history.quoted"));
  };

  return (
    <section className="panel bg-slate-950">
      <PanelHeader
        icon={<IconChart className="h-3.5 w-3.5" />}
        title={t("panel.history")}
        subtitle={loading ? t("common.loading") : t("history.tickerCount", { count: archives.length })}
        onToggleCollapse={onToggleCollapse}
        collapseDisabledReason={collapseDisabledReason}
        actions={
          // 過去ログと対話の並べ方を切り替える
          <span className="ui-fixed flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPortfolioSplit("horizontal")}
              aria-pressed={split === "horizontal"}
              title={t("history.splitVertical")}
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
              title={t("history.splitHorizontal")}
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
        {view === "heatmap" || view === "quarter" ? (
          <>
            {/* 俯瞰（全期）と、期を絞った横並びを切り替える */}
            <div className="mb-2 flex gap-1">
              {(["heatmap", "quarter"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  className={`min-h-6 rounded border px-2 t-label transition-colors ${
                    view === mode
                      ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
                      : "border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {mode === "heatmap" ? t("history.viewHeatmap") : t("history.viewQuarter")}
                </button>
              ))}
            </div>

            {view === "heatmap" ? (
              <PortfolioHeatmap entries={archive} onSelectTicker={openTimeline} />
            ) : (
              <QuarterCompareTable entries={archive} onSelectTicker={openTimeline} />
            )}
          </>
        ) : (
          <>
            {/* タイムライン。一覧へ戻る導線は必ず残す */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setView("heatmap")}
                className="min-h-6 shrink-0 rounded border border-slate-700 px-2 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
              >
                {t("history.back")}
              </button>
              <span className="font-mono t-body font-semibold text-emerald-300">
                {selected?.ticker ?? t("common.none")}
              </span>
              <span className="t-label text-slate-500">
                {t("history.periodCount", { count: selected?.entries.length ?? 0 })}
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
                    title={t("history.forwardHint")}
                    className="flex min-h-6 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-40"
                  >
                    📋 {transferring ? t("history.forwarding") : t("history.forwardAll")}
                  </button>
                )}
                {selected && (
                  <ExportMenu
                    label={t("analysis.export")}
                    records={() => recordsFor(selected.ticker)}
                    disabled={selected.entries.length === 0}
                  />
                )}
              </span>
            </div>

            {selected && (
              <ul className="space-y-1.5">
                {/*
                  期中のアドホック分析は四半期の下にぶら下げる。
                  **親が消えた子も根として出す**（画面から消えたように見せない）。
                */}
                {buildArchiveTree(selected.entries).map(({ entry, children }) => {
                  const label = periodLabelOf(entry);
                  const expanded = openEntry === entry.id;
                  const record = parseAnalysisRecord(entry.record ?? "{}");

                  return (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/40"
                    >
                      <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => void openLog(entry.id)}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
                      >
                        <span className="shrink-0 font-mono t-label text-slate-400">
                          {label}
                        </span>
                        <span className="shrink-0 font-mono t-body font-medium text-slate-100">
                          {entry.averageScore !== null
                            ? entry.averageScore.toFixed(1)
                            : t("common.none")}
                        </span>
                        {record?.summary.statusIcon && (
                          <span className="shrink-0">{record.summary.statusIcon}</span>
                        )}
                        <span className="min-w-0 flex-1 truncate t-label text-slate-600">
                          {new Date(entry.savedAtMs).toLocaleString("ja-JP")}
                          {entry.model ? ` / ${entry.model}` : ""}
                        </span>
                        <span className="shrink-0 t-label text-slate-500">
                          {expanded ? t("settings.close") : t("history.open")}
                        </span>
                      </button>

                      {/*
                        **開く操作とは別のボタンにする。** 同じ行の中に入れても、
                        親が「開く」ボタンだと押し分けられない。
                        既定色は目立たせず、狙って押したときだけ赤くする。
                      */}
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({ id: entry.id, ticker: selected.ticker, label })
                        }
                        title={t("history.delete")}
                        aria-label={t("history.deleteAria", {
                          ticker: selected.ticker,
                          label,
                        })}
                        className="shrink-0 px-2 text-slate-600 transition-colors hover:text-red-400"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                      </div>

                      {children.length > 0 && (
                        <ul className="space-y-1 border-t border-slate-800/70 px-2.5 py-1.5">
                          <li className="t-label text-slate-600">
                            {t("history.adhocCount", { count: children.length })}
                          </li>
                          {children.map((child) => (
                            <li key={child.id} className="flex items-center gap-2 pl-3">
                              <span className="shrink-0 text-slate-700" aria-hidden="true">
                                &#9492;
                              </span>
                              <button
                                type="button"
                                onClick={() => void openLog(child.id)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              >
                                <span className="shrink-0 font-mono t-label text-amber-400/80">
                                  {branchLabel(entry.periodLabel, child.branchNo)}
                                </span>
                                <span className="min-w-0 flex-1 truncate t-label text-slate-500">
                                  {new Date(child.savedAtMs).toLocaleString()}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingDelete({
                                    id: child.id,
                                    ticker: selected.ticker,
                                    label: branchLabel(entry.periodLabel, child.branchNo),
                                  })
                                }
                                title={t("history.delete")}
                                aria-label={t("history.deleteAria", {
                                  ticker: selected.ticker,
                                  label: branchLabel(entry.periodLabel, child.branchNo),
                                })}
                                className="shrink-0 px-1 text-slate-700 transition-colors hover:text-red-400"
                              >
                                <IconTrash className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      {expanded && (
                        <div className="border-t border-slate-800 px-2.5 py-2">
                          {/* 構造化データがあれば要点を先に見せる */}
                          {/*
                            **左右のペアはまとめて畳む。**
                            片方だけ畳んでも、隣が開いていれば行の高さは変わらない。
                            コンパクトにしたい人にとって意味のある単位はこの 2 枚 1 組。
                          */}
                          {record && record.blockScores.length > 0 && (
                            <CollapsibleSection
                              id="histScores"
                              title={t("history.scoresAndMetrics")}
                            >
                            <div className="mb-2 grid gap-2 sm:grid-cols-2">
                              <div>
                                <div className="mb-1 t-label font-medium uppercase tracking-wider text-slate-500">
                                  {t("history.blockScores")}
                                </div>
                                <ul className="space-y-0.5">
                                  {record.blockScores.map((b) => (
                                    <li
                                      key={b.id}
                                      className="flex items-baseline justify-between gap-2 t-label"
                                    >
                                      <span className="text-slate-400">{b.label}</span>
                                      <span className="font-mono text-slate-200">
                                        {b.score === null ? t("common.none") : b.score.toFixed(1)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <div className="mb-1 t-label font-medium uppercase tracking-wider text-slate-500">
                                  {t("history.keyMetrics")}
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
                            </CollapsibleSection>
                          )}

                          {record &&
                            (record.evaluations.strengths.length > 0 ||
                              record.evaluations.risks.length > 0) && (
                              <CollapsibleSection
                                id="histEvaluations"
                                title={t("history.strengthsAndRisks")}
                              >
                              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                                <div>
                                  <div className="mb-1 t-label font-medium text-emerald-400">
                                    {t("history.strengths")}
                                  </div>
                                  <ul className="space-y-0.5">
                                    {record.evaluations.strengths.map((item) => (
                                      <li
                                        key={item}
                                        className="selectable t-label text-slate-300"
                                      >
                                        &bull; {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <div className="mb-1 t-label font-medium text-amber-400">
                                    {t("history.risks")}
                                  </div>
                                  <ul className="space-y-0.5">
                                    {record.evaluations.risks.map((item) => (
                                      <li
                                        key={item}
                                        className="selectable t-label text-slate-300"
                                      >
                                        &bull; {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                              </CollapsibleSection>
                            )}

                          {fetching ? (
                            <p className="t-label text-slate-500">{t("common.loading")}</p>
                          ) : (
                            <>
                              <div className="mb-2 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => body && void copy(body)}
                                  disabled={!body}
                                  className="min-h-6 rounded border border-slate-700 px-2 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300 disabled:opacity-40"
                                >
                                  {t("history.copy")}
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
                                  {t("history.quote")}
                                </button>
                              </div>
                              {/*
                                評価テーブルを含む生の本文。**既定で畳む。**
                                表計算へ移すときにしか読まないので、
                                開いたままだと 1 件でタイムライン全体が埋まる。
                              */}
                              <CollapsibleSection id="histRawBody" title={t("history.rawBody")}>
                                <pre className="selectable max-h-96 overflow-auto whitespace-pre-wrap break-words t-label leading-relaxed text-slate-300">
                                  {body}
                                </pre>
                              </CollapsibleSection>
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

      {/*
        **消す前に必ず一度止める。** 分析は作り直すのに API 費用と時間がかかる。
        どの銘柄のどの期かを本文へ書いて、取り違えたまま消させない。
      */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("history.deleteConfirmTitle")}
        message={
          pendingDelete
            ? t("history.deleteConfirmBody", {
                ticker: pendingDelete.ticker,
                label: pendingDelete.label,
              })
            : ""
        }
        confirmLabel={t("history.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
