import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@/lib/tauri";
import { loadArchive, useArchive, useArchiveLoading } from "@/lib/portfolio/portfolioStore";
import { groupByTicker, periodLabelOf } from "@/lib/portfolio/archive";
import { pushChatDraft } from "@/lib/chat/chatDraft";
import {
  setPortfolioSplit,
  usePortfolioSplit,
} from "@/lib/ui/portfolioLayout";
import { toastError, toastSuccess } from "@/lib/ui/toastStore";
import PanelHeader from "@/components/PanelHeader";
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
 * 銘柄ごとの分析ログを時系列で並べ、**そのまま AI に投げられる**ようにする。
 * 過去の自分の分析と突き合わせるのが目的なので、
 * コピーと「対話へ引用」の 2 つの導線を用意している。
 */
export default function PortfolioHistoryPanel({
  onToggleCollapse,
  collapseDisabledReason = null,
}: Props) {
  const archive = useArchive();
  const loading = useArchiveLoading();
  const split = usePortfolioSplit();

  const [openTicker, setOpenTicker] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    void loadArchive();
  }, []);

  const archives = useMemo(() => groupByTicker(archive), [archive]);

  // 最初の銘柄を開いておく（空の画面から始めさせない）
  useEffect(() => {
    if (openTicker === null && archives.length > 0) setOpenTicker(archives[0].ticker);
  }, [archives, openTicker]);

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

  const selected = archives.find((a) => a.ticker === openTicker) ?? null;

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
        {archives.length === 0 ? (
          <p className="t-body leading-relaxed text-slate-500">
            まだ分析の履歴がありません。
            <br />
            銘柄を分析すると、実行のたびにここへ蓄積され、
            決算期をまたいだ推移を追えるようになります。
          </p>
        ) : (
          <>
            {/* 銘柄の切替 */}
            <div className="mb-2 flex flex-wrap gap-1">
              {archives.map((a) => (
                <button
                  key={a.ticker}
                  type="button"
                  onClick={() => {
                    setOpenTicker(a.ticker);
                    setOpenEntry(null);
                    setBody(null);
                  }}
                  className={`flex min-h-6 items-center gap-1 rounded border px-1.5 font-mono t-label transition-colors ${
                    a.ticker === openTicker
                      ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
                      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {a.ticker}
                  <span className="text-slate-600">{a.entries.length}</span>
                </button>
              ))}
            </div>

            {selected && (
              <ul className="space-y-1.5">
                {selected.entries.map((entry) => {
                  const label = periodLabelOf(entry);
                  const expanded = openEntry === entry.id;

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
