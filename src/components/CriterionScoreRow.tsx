import type { CriterionResult } from "@/lib/prompts/parseAnalysis";
import { useT } from "@/lib/i18n/i18n";

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
  const t = useT();
  const style = scoreStyle(row.score);
  const filled = row.score ?? 0;

  return (
    <div className="grid grid-cols-[1.75rem_minmax(8rem,12rem)_5.5rem_1fr] items-start gap-3 border-b border-slate-800/70 py-2.5 last:border-b-0">
      <span className="t-label pt-0.5 text-right font-mono text-slate-600">{row.id}</span>

      <div className="min-w-0">
        <div className="t-body text-slate-200">{row.label}</div>
        <div className="t-label text-slate-600">{row.category}</div>
      </div>

      <div className="pt-0.5">
        <div
          className="mb-1.5 flex items-center gap-1"
          aria-label={t("criterion.scoreAria", { score: row.score ?? t("criterion.unscored") })}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`h-2 w-2 shrink-0 rounded-full ${
                n <= filled ? style.bar : "bg-slate-800"
              }`}
            />
          ))}
        </div>
        <div className={`t-label ${style.text}`}>
          {row.score === 0 ? t("criterion.undecidable") : row.verdict || t("common.none")}
        </div>
      </div>

      <p className="selectable t-body pt-0.5 text-slate-300">{row.rationale}</p>
    </div>
  );
}
