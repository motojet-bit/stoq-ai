import type { MetricGroup } from "@/types";
import { IconChart } from "@/components/Icons";

interface Props {
  group: MetricGroup;
}

/** 指標グループ 1 つ分のカード。 */
export default function MetricCard({ group }: Props) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
      <div className="mb-2.5 flex items-center gap-2 text-[12px] font-medium text-slate-400">
        <IconChart className="h-3.5 w-3.5 text-slate-600" />
        {group.title}
      </div>
      <dl className="space-y-1.5">
        {group.metrics.map((m) => {
          const missing = m.raw === null && m.value === "—";
          return (
            <div key={m.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-[12px] text-slate-500">{m.label}</dt>
              <dd
                className={`selectable min-w-0 truncate text-right font-mono text-[12px] ${
                  missing ? "text-slate-700" : "text-slate-200"
                }`}
                title={m.value}
              >
                {m.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
