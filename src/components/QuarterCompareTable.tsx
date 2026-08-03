import { useMemo, useState } from "react";
import {
  availableQuarters,
  buildQuarterComparison,
} from "@/lib/portfolio/quarterCompare";
import type { ArchiveEntry } from "@/types";
import { useT } from "@/lib/i18n/i18n";

interface Props {
  entries: ArchiveEntry[];
  onSelectTicker: (ticker: string) => void;
}

/**
 * 指定した四半期のスコアを銘柄横断で並べる表。
 *
 * ヒートマップは「銘柄 × 全期」の俯瞰なので、
 * **同じ期だけを見比べたいときには向かない。**
 * 期を 1 つ選べば、ブロック別スコアまで並べて比べられる。
 */
export default function QuarterCompareTable({ entries, onSelectTicker }: Props) {
  const t = useT();
  const quarters = useMemo(() => availableQuarters(entries), [entries]);
  const [picked, setPicked] = useState<string | null>(null);
  // 既定は最新の期。選んだあとに履歴が増えても勝手に動かさない
  const quarter = picked ?? quarters[0] ?? null;

  const table = useMemo(
    () => (quarter ? buildQuarterComparison(entries, quarter) : null),
    [entries, quarter],
  );

  if (quarters.length === 0) {
    return <p className="t-label text-slate-600">{t("history.quarterEmpty")}</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {quarters.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setPicked(q)}
            aria-pressed={q === quarter}
            className={`min-h-6 rounded border px-2 font-mono t-label transition-colors ${
              q === quarter
                ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
                : "border-slate-700 text-slate-400 hover:border-slate-600"
            }`}
          >
            {q}
          </button>
        ))}
      </div>

      {table && table.rows.length === 0 ? (
        <p className="t-label text-slate-600">{t("history.quarterEmpty")}</p>
      ) : (
        table && (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-900/70">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-slate-900/95 px-2 py-1 text-left t-label font-medium text-slate-400">
                    {t("history.quarterTicker")}
                  </th>
                  <th className="whitespace-nowrap px-2 py-1 text-right t-label font-medium text-slate-400">
                    {t("history.quarterAverage")}
                  </th>
                  {table.blockLabels.map((b) => (
                    <th
                      key={b.id}
                      className="whitespace-nowrap px-2 py-1 text-right t-label font-medium text-slate-500"
                    >
                      {b.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.entryId} className="border-t border-slate-800/70">
                    <th className="sticky left-0 z-10 bg-slate-950/95 px-2 py-1 text-left">
                      <button
                        type="button"
                        onClick={() => onSelectTicker(row.ticker)}
                        className="font-mono t-label font-medium text-emerald-300 transition-colors hover:underline"
                      >
                        {row.statusIcon} {row.ticker}
                      </button>
                    </th>
                    <td className="px-2 py-1 text-right font-mono t-label font-medium text-slate-100">
                      {row.averageScore === null ? "—" : row.averageScore.toFixed(1)}
                    </td>
                    {table.blockLabels.map((b) => {
                      const score = row.blocks[b.id];
                      return (
                        <td
                          key={b.id}
                          className={`px-2 py-1 text-right font-mono t-label ${
                            score === null || score === undefined
                              ? "text-slate-700"
                              : score >= 4
                                ? "text-emerald-400"
                                : score >= 3
                                  ? "text-slate-300"
                                  : "text-amber-400"
                          }`}
                        >
                          {score === null || score === undefined ? "—" : score.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
