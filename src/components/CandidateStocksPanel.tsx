import { useState, type MouseEvent } from "react";
import type { CandidateStock } from "@/types";
import { removeCandidate, useCandidates } from "@/lib/candidates/candidateStore";
import ContextMenu, { type ContextMenuItem } from "@/components/ContextMenu";
import { MAX_COMPARE } from "@/lib/compare/compareData";
import CandidateImportModal from "@/components/CandidateImportModal";
import {
  IconBookmark,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@/components/Icons";
import Tooltip from "@/components/Tooltip";
import { TOOLTIPS } from "@/lib/ui/tooltipText";

interface Props {
  /** 銘柄をクリックしたとき。上部のティッカー入力欄にセットして分析へつなぐ */
  onSelectTicker: (ticker: string) => void;
  /** リストの高さ（px）。上の境界線ドラッグで変わる */
  height: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** 境界線のドラッグ開始（高さは親が持つ） */
  onResizeStart: (e: React.PointerEvent) => void;
  /** インポートモーダルの開閉（ショートカットからも開けるよう外に出している） */
  importOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
  /** チェックした銘柄を横並び比較する */
  onCompare: (tickers: string[]) => void;
}

interface MenuState {
  position: { x: number; y: number };
  candidate: CandidateStock;
}

/**
 * サイドバー下部の「検討中銘柄」小窓。
 *
 * 狭い領域でも一覧できるよう 1 行 1 銘柄のコンパクト表示にし、
 * 溢れたぶんは縦横ともスクロールで読めるようにしている。
 */
export default function CandidateStocksPanel({
  onSelectTicker,
  height,
  collapsed,
  onToggleCollapsed,
  onResizeStart,
  importOpen,
  onImportOpenChange,
  onCompare,
}: Props) {
  const candidates = useCandidates();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // 比較用の複数選択。ティッカーで持つ（削除されても壊れないように）
  const [selected, setSelected] = useState<string[]>([]);

  const visible = new Set(candidates.map((c) => c.ticker));
  const picked = selected.filter((t) => visible.has(t));
  const atLimit = picked.length >= MAX_COMPARE;

  const toggle = (ticker: string) => {
    setSelected((prev) =>
      prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : // 上限を超えたら古いものから外す（押しても無反応にしない）
          [...prev, ticker].slice(-MAX_COMPARE),
    );
  };

  const openMenu = (e: MouseEvent, candidate: CandidateStock) => {
    e.preventDefault();
    setMenu({ position: { x: e.clientX, y: e.clientY }, candidate });
  };

  const menuItems = (candidate: CandidateStock): ContextMenuItem[] => [
    {
      label: "この銘柄を分析",
      icon: <IconSearch className="h-3.5 w-3.5" />,
      onSelect: () => onSelectTicker(candidate.ticker),
    },
    {
      label: "削除",
      icon: <IconTrash className="h-3.5 w-3.5" />,
      destructive: true,
      onSelect: () => void removeCandidate(candidate.id),
    },
  ];

  return (
    <section className="flex shrink-0 flex-col">
      {/* 上の履歴との境界線。ドラッグで小窓の高さを変えられる */}
      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={onResizeStart}
        title="ドラッグして高さを変更"
        className="group relative h-1 shrink-0 cursor-row-resize bg-slate-800 hover:bg-emerald-600"
      >
        <div className="absolute inset-x-0 -top-2 h-5" />
      </div>

      <header className="flex min-h-8 shrink-0 items-center justify-between gap-2 px-3 pt-1.5">
        {/* ヘッダーのクリックでも折りたためる */}
        <Tooltip content={TOOLTIPS.candidates} placement="right" widthClass="w-72">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center gap-1.5 t-label font-medium uppercase tracking-wider text-slate-500 hover:text-slate-300"
          >
            <IconBookmark className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">検討中銘柄</span>
            {candidates.length > 0 && (
              <span className="shrink-0 font-mono normal-case text-slate-600">
                {candidates.length}
              </span>
            )}
          </button>
        </Tooltip>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onImportOpenChange(true)}
            title="パイプ区切り、またはティッカーの羅列からまとめて追加"
            className="flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-1.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
          >
            <IconPlus className="h-3 w-3" />
            追加
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "検討中銘柄を開く" : "検討中銘柄を折りたたむ"}
            title={collapsed ? "開く" : "折りたたむ"}
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            {collapsed ? (
              <IconChevronUp className="h-3 w-3" />
            ) : (
              <IconChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>
      </header>

      {/*
        高さは親から px で受け取る。`overflow-auto` で縦横ともスクロールするので、
        件数が増えても社名が長くても、はみ出して他の要素を押し出すことがない。
      */}
      {!collapsed && (
        <div style={{ height }} className="min-h-0 overflow-auto px-2 py-1.5">
          {candidates.length === 0 ? (
            <p className="px-1 py-3 t-label leading-relaxed text-slate-600">
              まだ登録がありません。
              <br />
              「＋ 追加」から
              <br />
              ティッカー|社名|ジャンル
              <br />
              を貼り付けてください。
            </p>
          ) : (
            <ul className="w-max min-w-full space-y-0.5">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <div
                    onContextMenu={(e) => openMenu(e, candidate)}
                    className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(candidate.ticker)}
                      onChange={() => toggle(candidate.ticker)}
                      aria-label={`${candidate.ticker} を比較対象にする`}
                      title="チェックした銘柄を横並びで比較できます"
                      className="shrink-0 accent-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => onSelectTicker(candidate.ticker)}
                      title={`${candidate.ticker}${candidate.name ? ` / ${candidate.name}` : ""}\nクリックで分析 / 右クリックでメニュー`}
                      className="flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap text-left"
                    >
                      <span className="shrink-0 font-mono t-label font-medium text-emerald-300">
                        {candidate.ticker}
                      </span>
                      {candidate.name && (
                        <span className="t-label text-slate-300">{candidate.name}</span>
                      )}
                      {candidate.genre && (
                        <span className="shrink-0 rounded bg-slate-700/70 px-1 t-label text-slate-400">
                          {candidate.genre}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void removeCandidate(candidate.id)}
                      aria-label={`${candidate.ticker} を削除`}
                      title="この銘柄を削除"
                      className="sticky right-0 shrink-0 rounded bg-slate-900 p-0.5 text-slate-600 opacity-0 hover:bg-red-950/60 hover:text-red-300 group-hover:opacity-100"
                    >
                      <IconClose className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 2 銘柄以上そろったら比較ボタンを出す */}
      {picked.length >= 2 && (
        <div className="shrink-0 border-t border-slate-800 px-2 py-1.5">
          <button
            type="button"
            onClick={() => onCompare(picked)}
            className="flex min-h-7 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 t-label font-medium text-white transition-colors hover:bg-emerald-500"
          >
            📊 選択した銘柄を横並び比較（最大{MAX_COMPARE}社）
            <span className="font-mono">{picked.length}</span>
          </button>
          {atLimit && (
            <p className="mt-1 t-label text-slate-500">
              最大 {MAX_COMPARE} 社まで。さらに選ぶと古い選択が外れます。
            </p>
          )}
        </div>
      )}

      <ContextMenu
        position={menu?.position ?? null}
        items={menu ? menuItems(menu.candidate) : []}
        onClose={() => setMenu(null)}
      />

      <CandidateImportModal open={importOpen} onClose={() => onImportOpenChange(false)} />
    </section>
  );
}
