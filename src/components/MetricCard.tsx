import type { MetricGroup } from "@/types";
import { IconChart } from "@/components/Icons";
import { t as tr } from "@/lib/i18n/i18n";

interface Props {
  group: MetricGroup;
}

/** 指標グループ 1 つ分のカード。 */
export default function MetricCard({ group }: Props) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5">
      <div className="t-heading mb-2.5 flex items-center gap-2 font-medium text-slate-400">
        <IconChart className="h-3.5 w-3.5 shrink-0 text-slate-600" />
        {group.title}
      </div>
      <dl className="space-y-2">
        {group.metrics.map((m) => {
          const missing = m.raw === null && m.value === tr("common.none");
          return (
            <div key={m.label} className="flex items-baseline justify-between gap-3">
              <dt className="t-label min-w-0 truncate text-slate-500">{m.label}</dt>
              <dd
                className={`selectable t-label min-w-0 truncate text-right font-mono ${
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
