import { useEffect, useMemo, useState } from "react";
import {
  addTickerToPortfolio,
  createPortfolio,
  loadArchive,
  removeTickerFromPortfolio,
  usePortfolios,
} from "@/lib/portfolio/portfolioStore";
import {
  buildSavePlan,
  buildTargets,
  hasChanges,
  saveSummary,
  toggleTarget,
} from "@/lib/portfolio/saveTarget";
import { toastSuccess } from "@/lib/ui/toastStore";
import ModalShell from "@/components/ModalShell";
import { IconBookmark, IconPlus } from "@/components/Icons";

interface Props {
  open: boolean;
  ticker: string | null;
  onClose: () => void;
}

/**
 * 「この分析をどのリストに残すか」を選ぶダイアログ。
 *
 * **すでに入っているリストは最初からチェック済み**にして、
 * 外す操作もここでできるようにしている（別画面へ行かせない）。
 */
export default function SaveToPortfolioModal({ open, ticker, onClose }: Props) {
  const portfolios = usePortfolios();
  // null = まだ触っていない（現状のチェック状態を使う）
  const [selected, setSelected] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open, ticker]);

  const rows = useMemo(
    () => buildTargets(portfolios, ticker ?? "", selected),
    [portfolios, ticker, selected],
  );
  const plan = useMemo(() => buildSavePlan(rows), [rows]);

  const toggle = (id: string) => {
    setSelected((prev) => toggleTarget(prev ?? rows.filter((r) => r.checked).map((r) => r.id), id));
  };

  const submit = async () => {
    if (!ticker) return;
    setBusy(true);
    try {
      for (const id of plan.add) await addTickerToPortfolio(id, ticker);
      for (const id of plan.remove) await removeTickerFromPortfolio(id, ticker);
      // アーカイブの「未分類」表示を更新するため読み直す
      await loadArchive();
      toastSuccess(saveSummary(ticker, plan));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="マイポートフォリオのどこに保存しますか？"
      icon={<IconBookmark className="h-4 w-4 text-emerald-400" />}
      maxWidthClass="max-w-lg"
      onClose={onClose}
      footer={
        <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-2">
          <span className="t-label text-slate-600">
            {hasChanges(plan)
              ? `追加 ${plan.add.length} / 削除 ${plan.remove.length}`
              : "変更はありません"}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-8 rounded-md border border-slate-700 px-3.5 t-body text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !ticker || !hasChanges(plan)}
              className="min-h-8 rounded-md bg-emerald-600 px-4 t-body font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </footer>
      }
    >
      <div className="px-5 py-4">
        <p className="mb-3 t-body leading-relaxed text-slate-400">
          <span className="font-mono font-semibold text-emerald-300">{ticker ?? "—"}</span>{" "}
          の分析を残すリストを選んでください。
          分析結果そのものは常に保存されており、ここで選ぶのは
          <strong className="text-slate-300">どのリストに並べるか</strong>だけです。
        </p>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center">
            <p className="mb-2 t-body text-slate-500">リストがまだありません。</p>
            <button
              type="button"
              onClick={() => void createPortfolio()}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 t-body text-slate-200 transition-colors hover:border-emerald-700 hover:text-emerald-300"
            >
              <IconPlus className="h-3.5 w-3.5" />
              新しいリストを作る
            </button>
          </div>
        ) : (
          <>
            <ul className="overflow-hidden rounded-lg border border-slate-800">
              {rows.map((row) => (
                <li key={row.id} className="border-b border-slate-800/80 last:border-0">
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-800/50">
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={() => toggle(row.id)}
                      className="shrink-0 accent-emerald-500"
                    />
                    <span className="min-w-0 flex-1 truncate t-body text-slate-200">
                      {row.name}
                    </span>
                    {row.alreadyIn && (
                      <span className="shrink-0 rounded bg-slate-800 px-1.5 t-label text-slate-400">
                        登録済み
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => void createPortfolio()}
              className="mt-2 inline-flex min-h-7 items-center gap-1.5 rounded-md border border-slate-700 px-2.5 t-label text-slate-300 transition-colors hover:border-emerald-700 hover:text-emerald-300"
            >
              <IconPlus className="h-3 w-3" />
              新しいリストを作る
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}
