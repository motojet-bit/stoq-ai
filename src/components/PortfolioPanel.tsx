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
import { useT } from "@/lib/i18n/i18n";

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
  const t = useT();
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
      label: t("portfolio.rename"),
      icon: <IconPencil className="h-3.5 w-3.5" />,
      onSelect: () => startRename(portfolio),
    },
    {
      label: t("portfolio.deleteList"),
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
            aria-label={t("portfolio.compareCheck", { ticker })}
            className="shrink-0 accent-emerald-500"
          />

          <button
            type="button"
            onClick={() =>
              setOpenTickers((prev) => toggle(prev, `${portfolioId ?? "-"}:${ticker}`))
            }
            aria-expanded={expanded}
            title={t("portfolio.archiveOf", { ticker, count: entries.entries.length })}
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
              <span className="shrink-0 t-label text-slate-600">{t("portfolio.unanalyzed")}</span>
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
              {entries.entries.length > 0 ? t("portfolio.entryCount", { count: entries.entries.length }) : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTicker(ticker)}
            aria-label={t("portfolio.analyzeAria", { ticker })}
            title={t("portfolio.analyzeHint")}
            className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 hover:bg-slate-700 hover:text-emerald-300 group-hover:opacity-100"
          >
            <IconSearch className="h-3 w-3" />
          </button>

          {portfolioId && (
            <button
              type="button"
              onClick={() => void removeTickerFromPortfolio(portfolioId, ticker)}
              aria-label={t("portfolio.removeAria", { ticker })}
              title={t("portfolio.removeHint")}
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
                {t("portfolio.noHistory")}
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
                    {entry.averageScore !== null ? entry.averageScore.toFixed(1) : t("common.none")}
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
          {t("sidebar.portfolios")}
        </span>
        <button
          type="button"
          onClick={() => void createPortfolio()}
          title={t("portfolio.newList")}
          className="flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-1.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
        >
          <IconPlus className="h-3 w-3" />
          {t("sidebar.newList")}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {portfolios.length === 0 && (
          <p className="px-2 py-6 text-center t-label leading-relaxed text-slate-600">
            {t("portfolio.noLists")}
            <br />
            {t("portfolio.noListsHint")}
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
                    aria-label={t("portfolio.listName")}
                    className="selectable min-h-6 w-full rounded border border-emerald-700 bg-slate-950 px-1 t-body text-slate-100 focus:outline-none"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenLists((prev) => toggle(prev, portfolio.id))}
                      aria-expanded={expanded}
                      title={t("portfolio.rowHint")}
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
                      aria-label={t("portfolio.renameAria", { name: portfolio.name })}
                      title={t("portfolio.rename")}
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
                      {t("portfolio.noTickers")}
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
          <p className="px-2 py-2 t-label text-slate-600">{t("portfolio.loadingArchive")}</p>
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
            📊 {t("candidates.compareButton", { max: MAX_COMPARE })}
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
        title={t("portfolio.deleteTitle")}
        message={t("portfolio.deleteBody", {
          name: deleting?.name ?? "",
          count: deleting?.tickers.length ?? 0,
        })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.back")}
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
