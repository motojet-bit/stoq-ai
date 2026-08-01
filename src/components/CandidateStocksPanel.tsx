import { useState, type MouseEvent } from "react";
import type { CandidateStock } from "@/types";
import { removeCandidate, useCandidates } from "@/lib/candidates/candidateStore";
import ContextMenu, { type ContextMenuItem } from "@/components/ContextMenu";
import CandidateImportModal from "@/components/CandidateImportModal";
import { IconBookmark, IconClose, IconPlus, IconSearch, IconTrash } from "@/components/Icons";

interface Props {
  /** 銘柄をクリックしたとき。上部のティッカー入力欄にセットして分析へつなぐ */
  onSelectTicker: (ticker: string) => void;
}

interface MenuState {
  position: { x: number; y: number };
  candidate: CandidateStock;
}

/**
 * サイドバー下部の「検討中銘柄」小窓。
 *
 * 狭い領域でも一覧できるよう 1 行 1 銘柄のコンパクト表示にし、
 * 横にはみ出す社名・ジャンルは横スクロールで読めるようにしている。
 */
export default function CandidateStocksPanel({ onSelectTicker }: Props) {
  const candidates = useCandidates();
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

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
    <section className="flex min-h-0 shrink-0 flex-col border-t border-slate-800">
      <header className="flex min-h-8 shrink-0 items-center justify-between gap-2 px-3 pt-2">
        <span className="flex items-center gap-1.5 t-label font-medium uppercase tracking-wider text-slate-500">
          <IconBookmark className="h-3.5 w-3.5" />
          検討中銘柄
          {candidates.length > 0 && (
            <span className="font-mono normal-case text-slate-600">{candidates.length}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setImporting(true)}
          title="パイプ区切りのテキストからまとめて追加"
          className="flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-1.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
        >
          <IconPlus className="h-3 w-3" />
          追加
        </button>
      </header>

      {/*
        小窓なので高さは控えめに。件数が増えたら縦スクロール、
        社名が長ければ横スクロールで読める。
      */}
      <div className="max-h-56 min-h-0 overflow-auto px-2 py-1.5">
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
          <ul className="space-y-0.5">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <div
                  onContextMenu={(e) => openMenu(e, candidate)}
                  className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => onSelectTicker(candidate.ticker)}
                    title={`${candidate.ticker}${candidate.name ? ` / ${candidate.name}` : ""}\nクリックで分析`}
                    className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
                  >
                    <span className="shrink-0 font-mono t-label font-medium text-emerald-300">
                      {candidate.ticker}
                    </span>
                    {candidate.name && (
                      <span className="min-w-0 truncate t-label text-slate-300">
                        {candidate.name}
                      </span>
                    )}
                    {candidate.genre && (
                      <span className="shrink-0 whitespace-nowrap rounded bg-slate-700/70 px-1 t-label text-slate-400">
                        {candidate.genre}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void removeCandidate(candidate.id)}
                    aria-label={`${candidate.ticker} を削除`}
                    title="この銘柄を削除"
                    className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 hover:bg-red-950/60 hover:text-red-300 group-hover:opacity-100"
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ContextMenu
        position={menu?.position ?? null}
        items={menu ? menuItems(menu.candidate) : []}
        onClose={() => setMenu(null)}
      />

      <CandidateImportModal open={importing} onClose={() => setImporting(false)} />
    </section>
  );
}
