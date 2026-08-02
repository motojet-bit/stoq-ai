import { useMemo } from "react";
import type { ArchiveEntry } from "@/types";
import { buildHeatmap, type HeatCell } from "@/lib/portfolio/heatmap";
import { IconChart } from "@/components/Icons";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  entries: ArchiveEntry[];
  /** 表示する銘柄を絞る（リストの中身を出すとき） */
  tickers?: string[];
  /** ティッカーをクリックしたとき。タイムラインへ移る */
  onSelectTicker: (ticker: string) => void;
}

/** スコアに応じた背景色。数字より先に色で傾向がつかめるようにする。 */
function cellClass(cell: HeatCell): string {
  if (cell.score === null) return "bg-slate-900/40 text-slate-700";
  if (cell.score >= 4) return "bg-emerald-900/50 text-emerald-200";
  if (cell.score >= 3) return "bg-amber-900/40 text-amber-200";
  return "bg-red-900/40 text-red-200";
}

/**
 * 保有銘柄 × 四半期のヒートマップ。
 *
 * マイポートフォリオの入口。**まず全体の傾向を色で見せ**、
 * 気になった銘柄をクリックしてタイムラインへ降りる流れにしている。
 */
export default function PortfolioHeatmap({ entries, tickers, onSelectTicker }: Props) {
  const t = useT();
  const map = useMemo(() => buildHeatmap(entries, tickers), [entries, tickers]);

  if (map.rows.length === 0) {
    return (
      <p className="px-1 py-4 t-body leading-relaxed text-slate-500">
        {t("heatmap.empty")}
        <br />
        {t("heatmap.emptyHint")}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <IconChart className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="t-label font-medium uppercase tracking-wider text-slate-500">
          {t("heatmap.title")}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60">
              <th className="sticky left-0 z-10 bg-slate-900 px-2 py-1.5 text-left t-label font-medium text-slate-500">
                {t("status.ticker")}
              </th>
              {map.quarters.map((quarter) => (
                <th
                  key={quarter}
                  className="whitespace-nowrap px-2 py-1.5 text-center font-mono t-label font-medium text-slate-400"
                >
                  {quarter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {map.rows.map((row) => (
              <tr key={row.ticker} className="border-b border-slate-800/70 last:border-0">
                <th className="sticky left-0 z-10 bg-slate-950 px-2 py-1 text-left">
                  <button
                    type="button"
                    onClick={() => onSelectTicker(row.ticker)}
                    title={t("heatmap.openTimeline", { ticker: row.ticker })}
                    className="flex items-center gap-1.5 font-mono t-label font-medium text-emerald-300 transition-colors hover:text-emerald-200 hover:underline"
                  >
                    {row.ticker}
                    <span className="font-normal text-slate-600">{row.count}期</span>
                  </button>
                </th>

                {map.quarters.map((quarter) => {
                  const cell = row.cells[quarter];
                  return (
                    <td key={quarter} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => onSelectTicker(row.ticker)}
                        disabled={cell.entryId === null}
                        title={
                          cell.score === null
                            ? t("heatmap.noPeriod")
                            : `${quarter}: ${cell.score.toFixed(1)} / 5`
                        }
                        className={`flex min-h-7 w-full items-center justify-center gap-1 rounded font-mono t-label transition-opacity hover:opacity-80 disabled:cursor-default ${cellClass(
                          cell,
                        )}`}
                      >
                        {cell.score === null ? (
                          t("common.none")
                        ) : (
                          <>
                            <span>{cell.statusIcon}</span>
                            <span>{cell.score.toFixed(1)}</span>
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="t-label text-slate-600">
        {t("heatmap.hint")}
      </p>
    </div>
  );
}
