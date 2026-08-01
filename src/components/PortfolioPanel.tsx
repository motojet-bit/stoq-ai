import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type { Portfolio } from "@/types";
import {
  addTickerToPortfolio,
  createPortfolio,
  loadArchive,
  loadPortfolios,
  removePortfolio,
  removeTickerFromPortfolio,
  renamePortfolio,
  useArchive,
  useArchiveLoading,
  usePortfolios,
} from "@/lib/portfolio/portfolioStore";
import {
  archivesFor,
  deltaLabel,
  groupByTicker,
  periodLabelOf,
} from "@/lib/portfolio/archive";
import { MAX_COMPARE } from "@/lib/compare/compareData";
import ContextMenu, { type ContextMenuItem } from "@/components/ContextMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@/components/Icons";

interface Props {
  /** 銘柄をクリックしたとき（単体分析へ） */
  onSelectTicker: (ticker: string) => void;
  /** チェックした銘柄を横並び比較する */
  onCompare: (tickers: string[]) => void;
}

interface MenuState {
  position: { x: number; y: number };
  portfolio: Portfolio;
}

/**
 * 「マイポートフォリオ」ビュー。
 *
 * リスト（フォルダ）ごとに銘柄をまとめ、各銘柄の**過去の分析を時系列で**辿れる。
 * `analyses` は最新 1 件しか持たないので、時系列は `analysis_history` から作る。
 */
export default function PortfolioPanel({ onSelectTicker, onCompare }: Props) {
  const portfolios = usePortfolios();
  const archive = useArchive();
  const loading = useArchiveLoading();

  const [openLists, setOpenLists] = useState<string[]>([]);
  const [openTickers, setOpenTickers] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deleting, setDeleting] = useState<Portfolio | null>(null);

  useEffect(() => {
    void loadPortfolios();
    void loadArchive();
  }, []);

  // 最初のリストは開いた状態で見せる（空の画面から始めさせない）
  useEffect(() => {
    if (portfolios.length > 0 && openLists.length === 0) {
      setOpenLists([portfolios[0].id]);
    }
    // 初回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios.length]);

  const archives = useMemo(() => groupByTicker(archive), [archive]);
  /** どのリストにも属さない、分析済みの銘柄 */
  const unfiled = useMemo(() => {
    const filed = new Set(portfolios.flatMap((p) => p.tickers));
    return archives.filter((a) => !filed.has(a.ticker));
  }, [archives, portfolios]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const toggleSelected = (ticker: string) => {
    setSelected((prev) =>
      prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : [...prev, ticker].slice(-MAX_COMPARE),
    );
  };

  const startRename = (portfolio: Portfolio) => {
    setRenaming(portfolio.id);
    setDraftName(portfolio.name);
  };

  const commitRename = () => {
    const id = renaming;
    const name = draftName.trim();
    setRenaming(null);
    if (id && name) void renamePortfolio(id, name);
  };

  const menuItems = (portfolio: Portfolio): ContextMenuItem[] => [
    {
      label: "名前を変更",
      icon: <IconPencil className="h-3.5 w-3.5" />,
      onSelect: () => startRename(portfolio),
    },
    {
      label: "リストを削除",
      icon: <IconTrash className="h-3.5 w-3.5" />,
      destructive: true,
      onSelect: () => setDeleting(portfolio),
    },
  ];

  const openMenu = (e: MouseEvent, portfolio: Portfolio) => {
    e.preventDefault();
    setMenu({ position: { x: e.clientX, y: e.clientY }, portfolio });
  };

  /** 銘柄 1 件の行と、開いたときの時系列アーカイブ */
  const renderTicker = (
    ticker: string,
    entries: ReturnType<typeof groupByTicker>[number],
    portfolioId: string | null,
  ) => {
    const expanded = openTickers.includes(`${portfolioId ?? "-"}:${ticker}`);
    const delta = deltaLabel(entries.scoreDelta);

    return (
      <li key={`${portfolioId ?? "-"}:${ticker}`}>
        <div className="group flex items-center gap-1.5 rounded px-1 py-1 hover:bg-slate-800">
          <input
            type="checkbox"
            checked={selected.includes(ticker)}
            onChange={() => toggleSelected(ticker)}
            aria-label={`${ticker} を比較対象にする`}
            className="shrink-0 accent-emerald-500"
          />

          <button
            type="button"
            onClick={() =>
              setOpenTickers((prev) => toggle(prev, `${portfolioId ?? "-"}:${ticker}`))
            }
            aria-expanded={expanded}
            title={`${ticker} の分析アーカイブ（${entries.entries.length} 件）`}
            className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
          >
            <span className="shrink-0 font-mono t-label font-medium text-emerald-300">
              {ticker}
            </span>
            {entries.latestScore !== null ? (
              <span className="shrink-0 font-mono t-label text-slate-300">
                {entries.latestScore.toFixed(1)}
              </span>
            ) : (
              <span className="shrink-0 t-label text-slate-600">未分析</span>
            )}
            {delta && (
              <span
                className={`shrink-0 t-label ${
                  entries.scoreDelta! > 0 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {delta}
              </span>
            )}
            <span className="ml-auto shrink-0 t-label text-slate-600">
              {entries.entries.length > 0 ? `${entries.entries.length}件` : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTicker(ticker)}
            aria-label={`${ticker} を分析`}
            title="この銘柄を分析する"
            className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 hover:bg-slate-700 hover:text-emerald-300 group-hover:opacity-100"
          >
            <IconSearch className="h-3 w-3" />
          </button>

          {portfolioId && (
            <button
              type="button"
              onClick={() => void removeTickerFromPortfolio(portfolioId, ticker)}
              aria-label={`${ticker} をリストから外す`}
              title="このリストから外す（分析結果は消えません）"
              className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 hover:bg-red-950/60 hover:text-red-300 group-hover:opacity-100"
            >
              <IconClose className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* 時系列アーカイブ */}
        {expanded && (
          <ul className="ml-5 border-l border-slate-800 pl-2">
            {entries.entries.length === 0 ? (
              <li className="py-1 t-label text-slate-600">
                分析の履歴がありません。
              </li>
            ) : (
              entries.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline gap-2 py-0.5 t-label text-slate-400"
                >
                  <span className="shrink-0 font-mono text-slate-500">
                    {periodLabelOf(entry)}
                  </span>
                  <span className="shrink-0 font-mono text-slate-300">
                    {entry.averageScore !== null ? entry.averageScore.toFixed(1) : "—"}
                  </span>
                  <span className="min-w-0 truncate text-slate-600">
                    {new Date(entry.savedAtMs).toLocaleDateString("ja-JP")}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-1 px-3 pb-1 pt-2">
        <span className="t-label font-medium uppercase tracking-wider text-slate-500">
          ポートフォリオ
        </span>
        <button
          type="button"
          onClick={() => void createPortfolio()}
          title="新しいリストを作る"
          className="flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-1.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
        >
          <IconPlus className="h-3 w-3" />
          新規リスト作成
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {portfolios.length === 0 && (
          <p className="px-2 py-6 text-center t-label leading-relaxed text-slate-600">
            リストがありません。
            <br />
            「＋ 新規リスト作成」から
            <br />
            作ってください。
          </p>
        )}

        {portfolios.map((portfolio) => {
          const expanded = openLists.includes(portfolio.id);
          const rows = archivesFor(archives, portfolio.tickers);

          return (
            <div key={portfolio.id} className="mb-1">
              <div
                onContextMenu={(e) => openMenu(e, portfolio)}
                className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-slate-800"
              >
                {renaming === portfolio.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    aria-label="リスト名"
                    className="selectable min-h-6 w-full rounded border border-emerald-700 bg-slate-950 px-1 t-body text-slate-100 focus:outline-none"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenLists((prev) => toggle(prev, portfolio.id))}
                      aria-expanded={expanded}
                      title="クリックで開閉 / 右クリックでメニュー"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      {expanded ? (
                        <IconChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
                      ) : (
                        <IconChevronUp className="h-3 w-3 shrink-0 text-slate-500" />
                      )}
                      <span className="truncate t-body font-medium text-slate-200">
                        {portfolio.name}
                      </span>
                      <span className="shrink-0 font-mono t-label text-slate-600">
                        {portfolio.tickers.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(portfolio)}
                      aria-label={`${portfolio.name} の名前を変更`}
                      title="名前を変更"
                      className="shrink-0 rounded p-1 text-slate-600 opacity-0 hover:bg-slate-700 hover:text-emerald-300 group-hover:opacity-100"
                    >
                      <IconPencil className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {expanded && (
                <ul className="ml-2 space-y-0.5 border-l border-slate-800 pl-1.5">
                  {rows.length === 0 ? (
                    <li className="px-1 py-2 t-label leading-relaxed text-slate-600">
                      銘柄がありません。「検討中銘柄」や分析結果から追加できます。
                    </li>
                  ) : (
                    rows.map((row) => renderTicker(row.ticker, row, portfolio.id))
                  )}
                </ul>
              )}
            </div>
          );
        })}

        {/* リストに未分類の分析済み銘柄 */}
        {unfiled.length > 0 && (
          <div className="mt-2 border-t border-slate-800 pt-2">
            <div className="px-1 pb-1 t-label font-medium uppercase tracking-wider text-slate-600">
              未分類の分析（{unfiled.length}）
            </div>
            <ul className="space-y-0.5">
              {unfiled.map((row) => renderTicker(row.ticker, row, null))}
            </ul>
          </div>
        )}

        {loading && (
          <p className="px-2 py-2 t-label text-slate-600">アーカイブを読み込み中…</p>
        )}
      </nav>

      {/* 2 銘柄以上そろったら比較できる */}
      {selected.length >= 2 && (
        <div className="shrink-0 border-t border-slate-800 px-2 py-1.5">
          <button
            type="button"
            onClick={() => onCompare(selected)}
            className="flex min-h-7 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 t-label font-medium text-white transition-colors hover:bg-emerald-500"
          >
            📊 選択した銘柄を横並び比較（最大{MAX_COMPARE}社）
            <span className="font-mono">{selected.length}</span>
          </button>
        </div>
      )}

      <ContextMenu
        position={menu?.position ?? null}
        items={menu ? menuItems(menu.portfolio) : []}
        onClose={() => setMenu(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="このリストを削除しますか？"
        message={
          `「${deleting?.name ?? ""}」と、その中の ${deleting?.tickers.length ?? 0} 銘柄の登録が消えます。\n` +
          "分析結果そのものは消えません（未分類として残ります）。"
        }
        confirmLabel="削除する"
        cancelLabel="もどる"
        destructive
        onConfirm={() => {
          if (deleting) void removePortfolio(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/** 「このリストに追加」をどこからでも呼べるようにする補助。 */
export async function addToPortfolio(id: string, ticker: string): Promise<void> {
  await addTickerToPortfolio(id, ticker);
}
