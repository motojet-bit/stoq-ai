import type { CriterionResult } from "@/lib/prompts/parseAnalysis";

interface Props {
  row: CriterionResult;
}

/** スコアに応じた色。0（判定不能）はグレー。 */
function scoreStyle(score: number | null): { bar: string; text: string } {
  if (score === null || score === 0) return { bar: "bg-slate-700", text: "text-slate-500" };
  if (score >= 4) return { bar: "bg-emerald-500", text: "text-emerald-400" };
  if (score === 3) return { bar: "bg-slate-500", text: "text-slate-300" };
  if (score === 2) return { bar: "bg-amber-500", text: "text-amber-400" };
  return { bar: "bg-red-500", text: "text-red-400" };
}

/** 20項目評価テーブルの 1 行。 */
export default function CriterionScoreRow({ row }: Props) {
  const style = scoreStyle(row.score);
  const filled = row.score ?? 0;

  return (
    <div className="grid grid-cols-[1.5rem_11rem_5.5rem_1fr] items-start gap-2 border-b border-slate-800/70 py-1.5 last:border-b-0">
      <span className="pt-0.5 text-right font-mono text-[11px] text-slate-600">{row.id}</span>

      <div className="min-w-0">
        <div className="truncate text-[12px] text-slate-300" title={row.label}>
          {row.label}
        </div>
        <div className="text-[10px] text-slate-600">{row.category}</div>
      </div>

      <div className="pt-0.5">
        <div className="mb-1 flex items-center gap-1" aria-label={`スコア ${row.score ?? "未判定"}`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`h-1.5 w-1.5 rounded-full ${
                n <= filled ? style.bar : "bg-slate-800"
              }`}
            />
          ))}
        </div>
        <div className={`truncate text-[11px] ${style.text}`} title={row.verdict}>
          {row.score === 0 ? "判定不能" : row.verdict || "—"}
        </div>
      </div>

      <p className="selectable pt-0.5 text-[11px] leading-relaxed text-slate-400">
        {row.rationale}
      </p>
    </div>
  );
}
